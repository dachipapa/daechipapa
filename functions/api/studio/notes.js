// GET /api/studio/notes  → 원자료 목록
// POST /api/studio/notes { title, body, source, kind } → 추가
import { requireAdmin, j } from "../../../lib/auth.js";

export async function onRequest({ request, env }) {
  const g = requireAdmin(request, env); if (g) return g;
  if (request.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,DELETE","Access-Control-Allow-Headers":"*" }});

  if (request.method === "GET") {
    const r = await env.DB.prepare(
      "SELECT id,title,source,kind,status,created_at FROM raw_notes ORDER BY created_at DESC LIMIT 100"
    ).all();
    return j(r.results || []);
  }

  if (request.method === "POST") {
    const { title, body, source, kind = "미분류" } = await request.json();
    if (!body) return j({ error: "body 필요" }, 400);
    const id = "n_" + Date.now();
    await env.DB.prepare(
      "INSERT INTO raw_notes (id,title,body,source,kind,status) VALUES (?,?,?,?,?,'inbox')"
    ).bind(id, title || body.slice(0, 40), body, source || "", kind).run();
    return j({ id, ok: true });
  }

  if (request.method === "DELETE") {
    const { id } = await request.json();
    await env.DB.prepare("DELETE FROM raw_notes WHERE id=?").bind(id).run();
    return j({ ok: true });
  }
  return j({ error: "Method not allowed" }, 405);
}
