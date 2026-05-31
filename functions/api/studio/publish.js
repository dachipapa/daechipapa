// POST /api/studio/publish { table, ids }  →  status: draft → live
import { requireAdmin, j } from "../../../lib/auth.js";

const ALLOWED = ["rules", "schools", "universities", "programs", "prompts"];

export async function onRequest({ request, env }) {
  const g = requireAdmin(request, env); if (g) return g;
  if (request.method !== "POST") return j({ error: "POST only" }, 405);

  const { table, ids } = await request.json();
  if (!ALLOWED.includes(table) || !Array.isArray(ids) || !ids.length)
    return j({ error: "table, ids[] 필요" }, 400);

  const placeholders = ids.map(() => "?").join(",");
  await env.DB.prepare(
    `UPDATE ${table} SET status='live', updated_at=${Date.now()} WHERE id IN (${placeholders})`
  ).bind(...ids).run();

  return j({ ok: true, published: ids.length });
}
