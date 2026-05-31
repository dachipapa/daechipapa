// GET /api/admin/reports?status=all|published|flagged  → 목록
// PATCH /api/admin/reports { id, action: flag|refund|publish }
import { requireAdmin, j } from "../../../lib/auth.js";

export async function onRequest({ request, env }) {
  const g = requireAdmin(request, env); if (g) return g;

  if (request.method === "GET") {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || "all";
    let sql = `SELECT r.id, r.kid_id, r.kind, r.status, r.confidence, r.created_at,
                      k.label AS kid_label, p.phone AS parent_phone
               FROM reports r
               LEFT JOIN kids k ON k.id = r.kid_id
               LEFT JOIN parents p ON p.id = k.parent_id`;
    if (status !== "all") sql += ` WHERE r.status='${status}'`;
    sql += " ORDER BY r.created_at DESC LIMIT 100";
    const r = await env.DB.prepare(sql).all();
    return j(r.results || []);
  }

  if (request.method === "PATCH") {
    const { id, action } = await request.json();
    if (!id || !action) return j({ error: "id, action 필요" }, 400);

    if (action === "flag") {
      await env.DB.prepare("UPDATE reports SET status='flagged' WHERE id=?").bind(id).run();
    } else if (action === "publish") {
      await env.DB.prepare("UPDATE reports SET status='published' WHERE id=?").bind(id).run();
    } else if (action === "refund") {
      await env.DB.prepare("UPDATE reports SET status='refunded' WHERE id=?").bind(id).run();
      // TODO: 토스 환불 API 호출 (결제 키 필요)
    }
    return j({ ok: true, id, action });
  }
  return j({ error: "Method not allowed" }, 405);
}
