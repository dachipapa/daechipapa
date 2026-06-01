// 토큰교환 → 유저 → 계정결정(연결 우선) → identity/device 기록 → 앱 복귀
// 계정결정 순서: ①명시적 link ②기존 identity(재로그인) ③이메일 ④휴대폰 ⑤같은 기기 ⑥신규
import { PROVIDERS, verifyState, exchangeCode, fetchUser } from "../../../../lib/oauth.js";
import { json } from "../../../../lib/claude.js";

const PID = (d) => "p_" + String(d).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);
const APP = (env) => env.APP_ORIGIN || "https://app.daechipapa.com";
function back(env, q){ return new Response(null,{status:302,headers:{Location:APP(env)+"/app.html#"+q}}); }

export async function onRequestGet({ params, request, env }) {
  try {
    const name = params.provider;
    if (!PROVIDERS[name]) return json({ error: "unknown provider" }, 404);
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return back(env, "err=nocode");
    const ck = (request.headers.get("Cookie") || "").match(/dp_oas=([^;]+)/);
    if (!ck || ck[1] !== state) return back(env, "err=state");
    const st = await verifyState(env, state);
    if (!st || st.n !== name) return back(env, "err=state");

    const token = await exchangeCode(env, name, code, state);
    if (!token) return back(env, "err=token");
    const u = await fetchUser(env, name, token);
    if (!u || !u.uid) return back(env, "err=user");

    const dev = st.device || "";
    const devPid = dev ? PID(dev) : null;

    // ── 계정 결정 ──
    let pid = null;
    // ① 명시적 연결 (로그인된 상태에서 "다른 로그인 연결")
    if (st.link) {
      const ex = await env.DB.prepare("SELECT id FROM parents WHERE id=? LIMIT 1").bind(st.link).first();
      if (ex) pid = ex.id;
    }
    // ② 기존 identity (이 provider+uid로 이미 로그인한 적 있음)
    if (!pid) {
      const ai = await env.DB.prepare("SELECT parent_id FROM auth_identities WHERE provider=? AND provider_uid=? LIMIT 1").bind(name, u.uid).first();
      if (ai) pid = ai.parent_id;
    }
    // ③ 같은 이메일
    if (!pid && u.email) {
      const ex = await env.DB.prepare("SELECT id FROM parents WHERE email=? LIMIT 1").bind(u.email).first();
      if (ex) pid = ex.id;
    }
    // ④ 같은 휴대폰
    if (!pid && u.phone) {
      const ex = await env.DB.prepare("SELECT id FROM parents WHERE phone=? LIMIT 1").bind(u.phone).first();
      if (ex) pid = ex.id;
    }
    // ⑤ 같은 기기 브릿지 (카카오처럼 PII 없는 경우)
    if (!pid && dev) {
      const dl = await env.DB.prepare("SELECT parent_id FROM device_links WHERE device_id=? LIMIT 1").bind(dev).first();
      if (dl) pid = dl.parent_id;
    }
    // ⑥ 신규
    if (!pid) pid = PID(name + "_" + u.uid);

    // ── 부모 PII upsert (있으면 채움, provider/uid는 최초값 유지) ──
    await env.DB.prepare(
      "INSERT INTO parents (id,nickname,name,phone,source,status,email,provider,provider_uid,age_range,birth_year,marketing_optin) " +
      "VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET " +
      "email=COALESCE(excluded.email,email), nickname=COALESCE(excluded.nickname,nickname), " +
      "name=COALESCE(excluded.name,name), phone=COALESCE(excluded.phone,phone), " +
      "age_range=COALESCE(excluded.age_range,age_range), birth_year=COALESCE(excluded.birth_year,birth_year)"
    ).bind(pid, u.nickname||null, u.name||null, u.phone||null, name, "active",
           u.email||null, name, u.uid, u.ageRange||null, u.birthYear||null, st.mk?1:0).run();

    // ── identity 연결 (다른 계정에 붙어있었다면 그 계정의 아이를 이 계정으로 병합) ──
    const prev = await env.DB.prepare("SELECT parent_id FROM auth_identities WHERE provider=? AND provider_uid=?").bind(name, u.uid).first();
    if (prev && prev.parent_id !== pid) {
      await env.DB.prepare("UPDATE kids SET parent_id=? WHERE parent_id=?").bind(pid, prev.parent_id).run();
    }
    await env.DB.prepare(
      "INSERT INTO auth_identities (provider,provider_uid,parent_id) VALUES (?,?,?) " +
      "ON CONFLICT(provider,provider_uid) DO UPDATE SET parent_id=excluded.parent_id"
    ).bind(name, u.uid, pid).run();
    if (prev && prev.parent_id !== pid) {
      await env.DB.prepare(
        "DELETE FROM parents WHERE id=? AND id<>? " +
        "AND NOT EXISTS(SELECT 1 FROM kids WHERE parent_id=?) " +
        "AND NOT EXISTS(SELECT 1 FROM auth_identities WHERE parent_id=?)"
      ).bind(prev.parent_id, pid, prev.parent_id, prev.parent_id).run();
    }

    // ── 기기→계정 브릿지 기록 ──
    if (dev) {
      await env.DB.prepare(
        "INSERT INTO device_links (device_id,parent_id,updated_at) VALUES (?,?,unixepoch()) " +
        "ON CONFLICT(device_id) DO UPDATE SET parent_id=excluded.parent_id, updated_at=excluded.updated_at"
      ).bind(dev, pid).run();
    }

    // ── 익명 기기부모(p_dev_*)에 담긴 아이를 이 계정으로 이관 후 정리 ──
    if (devPid && devPid !== pid) {
      await env.DB.prepare("UPDATE kids SET parent_id=? WHERE parent_id=?").bind(pid, devPid).run();
      await env.DB.prepare("DELETE FROM parents WHERE id=? AND id LIKE 'p_dev_%'").bind(devPid).run();
    }

    const kc = await env.DB.prepare("SELECT COUNT(*) c FROM kids WHERE parent_id=?").bind(pid).first();
    const headers = new Headers({ Location: APP(env)+"/app.html#p="+encodeURIComponent(pid)+"&prov="+name+"&kids="+((kc&&kc.c)||0) });
    headers.append("Set-Cookie", "dp_oas=; Path=/; Secure; SameSite=Lax; Max-Age=0");
    return new Response(null, { status: 302, headers });
  } catch (e) { return back(env, "err=ex"); }
}
