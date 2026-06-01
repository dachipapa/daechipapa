// GET /api/auth/{provider}/start?device=&mk= → provider 인증 페이지로 302
import { PROVIDERS, providerEnabled, redirectUri, signState } from "../../../../lib/oauth.js";
import { json } from "../../../../lib/claude.js";

export async function onRequestGet({ params, request, env }) {
  const name = params.provider;
  const p = PROVIDERS[name];
  if (!p) return json({ error: "unknown provider" }, 404);
  if (!providerEnabled(env, name)) return json({ error: name + " 로그인 미설정 (client_id 없음)" }, 503);

  const url = new URL(request.url);
  const device = url.searchParams.get("device") || "";
  const mk = url.searchParams.get("mk") === "1" ? 1 : 0;
  const state = await signState(env, { n: name, device, mk });

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
