// GET /api/auth/config → 어떤 소셜 로그인이 켜져있는지 (키 등록된 것만)
import { PROVIDERS, providerEnabled } from "../../../lib/oauth.js";
import { json } from "../../../lib/claude.js";

export async function onRequestGet({ env }) {
  const providers = Object.keys(PROVIDERS).filter((n) => providerEnabled(env, n));
  return json({ providers });
}
