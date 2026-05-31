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
    const kids = await env.DB.prepare("SELECT id FROM kids WHERE parent_id=?").bind(parentId).all();
    const kidIds = (kids.results || []).map(k => k.id);
    const stmts = [];
    for (const kid of kidIds) {
      stmts.push(env.DB.prepare("DELETE FROM chats WHERE kid_id=?").bind(kid));
      stmts.push(env.DB.prepare("DELETE FROM schedules WHERE kid_id=?").bind(kid));
      stmts.push(env.DB.prepare("DELETE FROM reports WHERE kid_id=?").bind(kid));
    }
    stmts.push(env.DB.prepare("DELETE FROM kids WHERE parent_id=?").bind(parentId));
    stmts.push(env.DB.prepare("DELETE FROM credits WHERE parent_id=?").bind(parentId));
    stmts.push(env.DB.prepare("DELETE FROM payments WHERE parent_id=?").bind(parentId));
    stmts.push(env.DB.prepare("DELETE FROM parents WHERE id=?").bind(parentId));
    await env.DB.batch(stmts);
    return j({ ok: true, deleted: parentId, kids: kidIds.length });
  }
  return j({ error: "Method not allowed" }, 405);
}
