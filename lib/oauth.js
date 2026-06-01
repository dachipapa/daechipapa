// 소셜 로그인 공용 유틸 — 카카오 / 네이버 / 구글
// client_id·secret·AUTH_SECRET 는 모두 env(시크릿)에서 읽음. 키 없으면 해당 provider 자동 비활성.

export const PROVIDERS = {
  kakao: {
    idKey: "KAKAO_CLIENT_ID", secretKey: "KAKAO_CLIENT_SECRET",
    authorize: "https://kauth.kakao.com/oauth/authorize",
    token: "https://kauth.kakao.com/oauth/token",
    userinfo: "https://kapi.kakao.com/v2/user/me",
    scope: "profile_nickname account_email birthyear age_range",
  },
  naver: {
    idKey: "NAVER_CLIENT_ID", secretKey: "NAVER_CLIENT_SECRET",
    authorize: "https://nid.naver.com/oauth2.0/authorize",
    token: "https://nid.naver.com/oauth2.0/token",
    userinfo: "https://openapi.naver.com/v1/nid/me",
    scope: "",
  },
  google: {
    idKey: "GOOGLE_CLIENT_ID", secretKey: "GOOGLE_CLIENT_SECRET",
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
  },
};

export function providerEnabled(env, name) {
  const p = PROVIDERS[name];
  return !!(p && env[p.idKey]);
}
export function redirectUri(env, name) {
  return (env.APP_ORIGIN || "https://app.daechipapa.com") + "/api/auth/" + name + "/callback";
}

// ---- 서명 state (HMAC-SHA256, 위변조/CSRF 방지) ----
function b64url(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(escape(atob(s)));
}
async function hmac(env, msg) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(env.AUTH_SECRET || "dev-secret-change-me"),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  let b = ""; new Uint8Array(sig).forEach((x) => (b += String.fromCharCode(x)));
  return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function signState(env, obj) {
  const payload = b64url(JSON.stringify({ ...obj, t: Date.now() }));
  return payload + "." + (await hmac(env, payload));
}
export async function verifyState(env, state) {
  if (!state || state.indexOf(".") < 0) return null;
  const [payload, sig] = state.split(".");
  if (sig !== (await hmac(env, payload))) return null;
  let obj; try { obj = JSON.parse(unb64url(payload)); } catch { return null; }
  if (!obj.t || Date.now() - obj.t > 600000) return null; // 10분 만료
  return obj;
}

// ---- code → access_token ----
export async function exchangeCode(env, name, code, state) {
  const p = PROVIDERS[name];
  const params = {
    grant_type: "authorization_code",
    client_id: env[p.idKey], client_secret: env[p.secretKey] || "",
    redirect_uri: redirectUri(env, name), code,
  };
  if (name === "naver" && state) params.state = state;
  const r = await fetch(p.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const d = await r.json();
  return d.access_token || null;
}

// ---- userinfo → 정규화 {provider,uid,email,nickname,birthYear,ageRange} ----
export async function fetchUser(env, name, accessToken) {
  const p = PROVIDERS[name];
  const r = await fetch(p.userinfo, { headers: { Authorization: "Bearer " + accessToken } });
  const d = await r.json();
  if (name === "kakao") {
    const a = d.kakao_account || {};
    return { provider: "kakao", uid: String(d.id || ""), email: a.email || "",
      nickname: (a.profile && a.profile.nickname) || "", birthYear: a.birthyear || "", ageRange: a.age_range || "" };
  }
  if (name === "naver") {
    const a = d.response || {};
    return { provider: "naver", uid: String(a.id || ""), email: a.email || "",
      nickname: a.nickname || a.name || "", birthYear: a.birthyear || "", ageRange: a.age || "" };
  }
  // google — 기본 userinfo엔 생년 없음 → 연령은 자가신고(만14세 체크)로 처리
  return { provider: "google", uid: String(d.sub || ""), email: d.email || "",
    nickname: d.name || "", birthYear: "", ageRange: "" };
}
