// GET /api/studio/uni-search?q=건국대 — 대학 검색 (admin)
import { requireAdmin, j } from "../../../lib/auth.js";

export async function onRequest({ request, env }) {
  const g = requireAdmin(request, env); if (g) return g;
  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  if (q.length < 1) return j({ universities: [] });
  try {
    const res = await env.DB.prepare(
      "SELECT id, name FROM universities WHERE name LIKE ? ORDER BY length(name) ASC LIMIT 15"
    ).bind("%" + q + "%").all();
    return j({ universities: res.results || [] });
  } catch (e) { return j({ error: String(e.message || e) }, 500); }
}
