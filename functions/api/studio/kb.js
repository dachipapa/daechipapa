// /api/studio/kb?table=rules|schools|prompts
// GET(목록) POST(생성) PATCH(수정) DELETE(삭제)
import { requireAdmin, j } from "../../../lib/auth.js";

const ALLOWED = ["rules", "schools", "universities", "programs", "prompts"];

export async function onRequest({ request, env }) {
  const g = requireAdmin(request, env); if (g) return g;
  const url = new URL(request.url);
  const table = url.searchParams.get("table");
  if (!ALLOWED.includes(table)) return j({ error: "table 파라미터 필요: " + ALLOWED.join("|") }, 400);

  if (request.method === "GET") {
    const status = url.searchParams.get("status"); // draft|live|all
    let sql = `SELECT * FROM ${table}`;
    if (status && status !== "all") sql += ` WHERE status='${status}'`;
    sql += " ORDER BY rowid DESC LIMIT 200";
    const r = await env.DB.prepare(sql).all();
    return j(r.results || []);
  }

  if (request.method === "POST") {
    const data = await request.json();
    const id = data.id || table.slice(0, 2) + "_" + Date.now();
    if (table === "rules") {
      await env.DB.prepare(
        "INSERT OR REPLACE INTO rules (id,category,content,tags,source_note_id,status) VALUES (?,?,?,?,?,'draft')"
      ).bind(id, data.category || "기타", data.content, data.tags || "", data.source_note_id || "").run();
    } else if (table === "prompts") {
      const ver = (data.version || 1);
      await env.DB.prepare(
        "INSERT OR REPLACE INTO prompts (id,kind,version,content,status) VALUES (?,?,?,?,'draft')"
      ).bind(id, data.kind, ver, data.content).run();
    } else if (table === "schools") {
      await env.DB.prepare(
        "INSERT OR REPLACE INTO schools (id,name,region,type,data,source,year) VALUES (?,?,?,?,?,?,?)"
      ).bind(id, data.name, data.region || "", data.type || "", JSON.stringify(data.data || {}), data.source || "", data.year || new Date().getFullYear()).run();
    }
    return j({ id, ok: true });
  }

  if (request.method === "PATCH") {
    const { id, ...updates } = await request.json();
    if (!id) return j({ error: "id 필요" }, 400);
    const sets = Object.keys(updates).map(k => `${k}=?`).join(",");
    await env.DB.prepare(`UPDATE ${table} SET ${sets},updated_at=${Date.now()} WHERE id=?`)
      .bind(...Object.values(updates), id).run();
    return j({ ok: true });
  }

  if (request.method === "DELETE") {
    const { id } = await request.json();
    await env.DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id).run();
    return j({ ok: true });
  }
  return j({ error: "Method not allowed" }, 405);
}
