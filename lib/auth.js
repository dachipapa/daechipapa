// 어드민 API 보호 — X-Admin-Secret 헤더로 검증
// 배포 후:  wrangler pages secret put ADMIN_SECRET --project-name daechipapa
export function requireAdmin(request, env) {
  if (!env.ADMIN_SECRET) return null; // 시크릿 미설정 시 개발 모드 허용
  const secret = request.headers.get("x-admin-secret") || "";
  if (secret !== env.ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "content-type": "application/json" }
    });
  }
  return null;
}
export const cors = { "Access-Control-Allow-Origin": "*", "content-type": "application/json" };
export const j = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: cors });
