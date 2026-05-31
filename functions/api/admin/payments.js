// GET /api/admin/payments — 결제 내역 (admin)
import { requireAdmin, j } from "../../../lib/auth.js";

export async function onRequest({ request, env }) {
  const g = requireAdmin(request, env); if (g) return g;
  if (request.method !== "GET") return j({ error: "GET only" }, 405);
  const r = await env.DB.prepare(
    `SELECT pay.id, pay.amount, pay.product, pay.status, pay.created_at, p.id AS parent_id
     FROM payments pay LEFT JOIN parents p ON p.id = pay.parent_id
     ORDER BY pay.created_at DESC LIMIT 100`
  ).all();
  const rows = r.results || [];
  const total = rows.filter(x => x.status === "paid").reduce((s, x) => s + (x.amount || 0), 0);
  return j({ payments: rows, totalPaid: total });
}
