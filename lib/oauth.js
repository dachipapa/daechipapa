// 소셜 로그인 공용 유틸 — 카카오 / 네이버 / 구글
export const PROVIDERS = {
  kakao: {
    idKey: "KAKAO_CLIENT_ID", secretKey: "KAKAO_CLIENT_SECRET",
    authorize: "https://kauth.kakao.com/oauth/authorize",
    token: "https://kauth.kakao.com/oauth/token",
    userinfo: "https://kapi.kakao.com/v2/user/me",
    // 휴대폰/실명은 비즈앱 전환+검수 후 "phone_number","name" 추가. 지금은 닉네임만.
    scope: "profile_nickname",
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
export function providerEnabled(env, name){ const p=PROVIDERS[name]; return !!(p && env[p.idKey]); }
export function redirectUri(env, name){ return (env.APP_ORIGIN||"https://app.daechipapa.com")+"/api/auth/"+name+"/callback"; }

function b64url(s){ return btoa(unescape(encodeURIComponent(s))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
function unb64url(s){ s=s.replace(/-/g,"+").replace(/_/g,"/"); return decodeURIComponent(escape(atob(s))); }
async function hmac(env,msg){
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.AUTH_SECRET||"dev-secret-change-me"),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(msg));
  let b=""; new Uint8Array(sig).forEach(x=>b+=String.fromCharCode(x));
  return btoa(b).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
export async function signState(env,obj){ const p=b64url(JSON.stringify({...obj,t:Date.now()})); return p+"."+(await hmac(env,p)); }
export async function verifyState(env,state){
  if(!state||state.indexOf(".")<0) return null;
  const [p,sig]=state.split("."); if(sig!==(await hmac(env,p))) return null;
  let o; try{o=JSON.parse(unb64url(p));}catch{return null;}
  if(!o.t||Date.now()-o.t>600000) return null; return o;
}
export async function exchangeCode(env,name,code,state){
  const p=PROVIDERS[name];
  const params={grant_type:"authorization_code",client_id:env[p.idKey],client_secret:env[p.secretKey]||"",redirect_uri:redirectUri(env,name),code};
  if(name==="naver"&&state) params.state=state;
  const r=await fetch(p.token,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(params)});
  const d=await r.json(); return d.access_token||null;
}
export async function fetchUser(env,name,accessToken){
  const p=PROVIDERS[name];
  const r=await fetch(p.userinfo,{headers:{Authorization:"Bearer "+accessToken}});
  const d=await r.json();
  if(name==="kakao"){
    const a=d.kakao_account||{};
    return {provider:"kakao", uid:String(d.id||""), email:a.email||"",
      nickname:(a.profile&&a.profile.nickname)||"", name:a.name||"",
      phone:a.phone_number||"", birthYear:a.birthyear||"", ageRange:a.age_range||""};
  }
  if(name==="naver"){
    const a=d.response||{};
    return {provider:"naver", uid:String(a.id||""), email:a.email||"",
      nickname:a.nickname||"", name:a.name||"",
      phone:a.mobile_e164||a.mobile||"", birthYear:a.birthyear||"", ageRange:a.age||""};
  }
  return {provider:"google", uid:String(d.sub||""), email:d.email||"",
    nickname:d.name||"", name:d.name||"", phone:"", birthYear:"", ageRange:""};
}
