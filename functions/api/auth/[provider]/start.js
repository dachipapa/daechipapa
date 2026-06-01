// GET /api/auth/{provider}/start?device=&mk=&link= → provider 인증 페이지로 302
// link= 가 있으면(로그인된 상태에서 계정연결) 콜백이 그 부모에 이 로그인을 붙인다.
import { PROVIDERS, providerEnabled, redirectUri, signState } from "../../../../lib/oauth.js";
import { json } from "../../../../lib/claude.js";

export async function onRequestGet({ params, request, env }) {
  const name = params.provider;
  const p = PROVIDERS[name];
  if (!p) return json({ error: "unknown provider" }, 404);
  if (!providerEnabled(env, name)) return json({ error: name + " 로그인 미설정 (client_id 없음)" }, 503);

  const url = new URL(request.url);
  const device = url.searchParams.get("device") || "";
  const link = url.searchParams.get("link") || "";
  const mk = url.searchParams.get("mk") === "1" ? 1 : 0;
  const state = await signState(env, { n: name, device, mk, link });

  // JS SDK 간편로그인용: 쿠키(dp_oas)만 심고 state를 JSON으로 반환 (302 대신)
  if (url.searchParams.get("mode") === "json") {
    const hj = new Headers({ "Content-Type": "application/json" });
    hj.append("Set-Cookie", "dp_oas=" + state + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600");
    return new Response(JSON.stringify({ state, redirectUri: redirectUri(env, name), scope: p.scope || "" }), { status: 200, headers: hj });
  }

  const auth = new URL(p.authorize);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("client_id", env[p.idKey]);
  auth.searchParams.set("redirect_uri", redirectUri(env, name));
  auth.searchParams.set("state", state);
  if (p.scope) auth.searchParams.set("scope", p.scope);

  const headers = new Headers({ Location: auth.toString() });
  headers.append("Set-Cookie", "dp_oas=" + state + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600");
  return new Response(null, { status: 302, headers });
}
