// 토큰교환 → 유저 → 부모 upsert(이름·휴대폰 포함) → 앱 복귀
// 같은 이메일 또는 같은 휴대폰이면 provider 달라도 한 계정으로 연결.
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

    // 계정 결정: 같은 이메일 → 같은 휴대폰 → 그래도 없으면 provider+uid 신규
    let pid = null;
    if (u.email) {
      const ex = await env.DB.prepare("SELECT id FROM parents WHERE email=? LIMIT 1").bind(u.email).first();
      if (ex) pid = ex.id;
    }
    if (!pid && u.phone) {
      const ex = await env.DB.prepare("SELECT id FROM parents WHERE phone=? LIMIT 1").bind(u.phone).first();
      if (ex) pid = ex.id;
    }
    if (!pid) pid = PID(name + "_" + u.uid);

    await env.DB.prepare(
      "INSERT INTO parents (id,nickname,name,phone,source,status,email,provider,provider_uid,age_range,birth_year,marketing_optin) " +
      "VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET " +
      "email=COALESCE(excluded.email,email), nickname=COALESCE(excluded.nickname,nickname), " +
      "name=COALESCE(excluded.name,name), phone=COALESCE(excluded.phone,phone), " +
      "age_range=COALESCE(excluded.age_range,age_range), birth_year=COALESCE(excluded.birth_year,birth_year)"
    ).bind(pid, u.nickname||null, u.name||null, u.phone||null, name, "active",
           u.email||null, name, u.uid, u.ageRange||null, u.birthYear||null, st.mk?1:0).run();

    if (st.device) {
      const dpid = PID(st.device);
      if (dpid !== pid) {
        await env.DB.prepare("UPDATE kids SET parent_id=? WHERE parent_id=?").bind(pid, dpid).run();
        await env.DB.prepare("DELETE FROM parents WHERE id=? AND id LIKE 'p_dev_%'").bind(dpid).run();
      }
    }
    const kc = await env.DB.prepare("SELECT COUNT(*) c FROM kids WHERE parent_id=?").bind(pid).first();
    const headers = new Headers({ Location: APP(env)+"/app.html#p="+encodeURIComponent(pid)+"&prov="+name+"&kids="+((kc&&kc.c)||0) });
    headers.append("Set-Cookie", "dp_oas=; Path=/; Secure; SameSite=Lax; Max-Age=0");
    return new Response(null, { status: 302, headers });
  } catch (e) { return back(env, "err=ex"); }
}
