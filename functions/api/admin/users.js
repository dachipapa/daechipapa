// GET /api/admin/users → 부모 계정 + 아이 수 목록
// DELETE /api/admin/users { parentId } → PIPA 삭제 처리
import { requireAdmin, j } from "../../../lib/auth.js";

export async function onRequest({ request, env }) {
  const g = requireAdmin(request, env); if (g) return g;

  if (request.method === "GET") {
    const r = await env.DB.prepare(
      `SELECT p.id, p.phone, p.nickname, p.status, p.source, p.created_at,
              COUNT(k.id) AS kids_count
       FROM parents p
       LEFT JOIN kids k ON k.parent_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC LIMIT 200`
    ).all();
    return j(r.results || []);
  }

  if (request.method === "DELETE") {
    const { parentId } = await request.json();
    if (!parentId) return j({ error: "parentId 필요" }, 400);
    // CASCADE: kids, chats, schedules, reports, credits 모두 삭제 (FK CASCADE 설정됨)
    await env.DB.prepare("DELETE FROM parents WHERE id=?").bind(parentId).run();
    return j({ ok: true, deleted: parentId });
  }
  return j({ error: "Method not allowed" }, 405);
}
