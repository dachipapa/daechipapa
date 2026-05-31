// GET /api/schools?q=휘문   학교 자동완성 검색
import { json } from "../../lib/claude.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (q.length < 1) return json({ schools: [] });
  try {
    const res = await env.DB.prepare(
      "SELECT id, name, region, data FROM schools WHERE name LIKE ? ORDER BY length(name) ASC LIMIT 10"
    ).bind("%" + q + "%").all();
    const schools = (res.results || []).map(s => {
      let d = {}; try { d = JSON.parse(s.data); } catch {}
      return { id: s.id, name: s.name, code: d.code || null, addr: d.addr || "", type: s.type || "" };
    });
    return json({ schools });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
