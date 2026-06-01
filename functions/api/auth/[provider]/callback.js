// GET /api/auth/{provider}/callback?code=&state= → 토큰교환 → 유저 → 부모 upsert → 앱 복귀
import { PROVIDERS, verifyState, exchangeCode, fetchUser } from "../../../../lib/oauth.js";
import { json } from "../../../../lib/claude.js";

const PID = (d) => "p_" + String(d).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);
const APP = (env) => env.APP_ORIGIN || "https://app.daechipapa.com";
function back(env, q) {
  return new Response(null, { status: 302, headers: { Location: APP(env) + "/app.html#" + q } });
}

export async function onRequestGet({ params, request, env }) {
  try {
    const name = params.provider;
    if (!PROVIDERS[name]) return json({ error: "unknown provider" }, 404);

    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return back(env, "err=nocode");

    // CSRF: 쿠키의 state와 일치 + 서명/만료 검증
    const ck = (request.headers.get("Cookie") || "").match(/dp_oas=([^;]+)/);
    if (!ck || ck[1] !== state) return back(env, "err=state");
    const st = await verifyState(env, state);
    if (!st || st.n !== name) return back(env, "err=state");

    const token = await exchangeCode(env, name, code, state);
    if (!token) return back(env, "err=token");
    const u = await fetchUser(env, name, token);
    if (!u || !u.uid) return back(env, "err=user");

    const pid = PID(name + "_" + u.uid);
    await env.DB.prepare(
      "INSERT INTO parents (id,nickname,source,status,email,provider,provider_uid,age_range,birth_year,marketing_optin) " +
      "VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET " +
      "email=excluded.email, nickname=excluded.nickname, age_range=excluded.age_range, birth_year=excluded.birth_year"
    ).bind(pid, u.nickname || null, name, "active", u.email || null, name, u.uid,
           u.ageRange || null, u.birthYear || null, st.mk ? 1 : 0).run();

    // 기기 부모 → 소셜 계정 승격: 체험 중 만든 아이들을 이전
    if (st.device) {
      const dpid = PID(st.device);
      if (dpid !== pid) {
        await env.DB.prepare("UPDATE kids SET parent_id=? WHERE parent_id=?").bind(pid, dpid).run();
        await env.DB.prepare("DELETE FROM parents WHERE id=? AND id LIKE 'p_dev_%'").bind(dpid).run();
      }
    }

    const kc = await env.DB.prepare("SELECT COUNT(*) c FROM kids WHERE parent_id=?").bind(pid).first();
    const headers = new Headers({
      Location: APP(env) + "/app.html#p=" + encodeURIComponent(pid) + "&prov=" + name + "&kids=" + ((kc && kc.c) || 0),
    });
    headers.append("Set-Cookie", "dp_oas=; Path=/; Secure; SameSite=Lax; Max-Age=0");
    return new Response(null, { status: 302, headers });
  } catch (e) {
    return back(env, "err=ex");
  }
}
