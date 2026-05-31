// GET  /api/studio/programs?uni=<id>   학과 목록 (admission 포함)
// POST /api/studio/programs  { programId, entry }  입결·전형 항목 추가
// POST /api/studio/programs  { programId, deleteIndex }  항목 삭제
import { requireAdmin, j } from "../../../lib/auth.js";

export async function onRequestGet({ request, env }) {
  const g = requireAdmin(request, env); if (g) return g;
  const url = new URL(request.url);
  const uni = url.searchParams.get("uni");
  const q = url.searchParams.get("q");
  try {
    let res;
    if (uni) {
      res = await env.DB.prepare(
        "SELECT id, name, admission FROM programs WHERE university_id = ? ORDER BY name LIMIT 400"
      ).bind(uni).all();
    } else if (q) {
      res = await env.DB.prepare(
        "SELECT id, name, admission, university_id FROM programs WHERE name LIKE ? LIMIT 50"
      ).bind("%" + q + "%").all();
    } else return j({ programs: [] });
    return j({ programs: res.results || [] });
  } catch (e) { return j({ error: String(e.message || e) }, 500); }
}

export async function onRequestPost({ request, env }) {
  const g = requireAdmin(request, env); if (g) return g;
  try {
    const body = await request.json();
    const { programId, entry, deleteIndex } = body;
    if (!programId) return j({ error: "programId 필요" }, 400);
    const p = await env.DB.prepare("SELECT admission FROM programs WHERE id = ?").bind(programId).first();
    if (!p) return j({ error: "학과를 찾을 수 없음" }, 404);
    let adm = {}; try { adm = JSON.parse(p.admission || "{}"); } catch { adm = {}; }
    if (!Array.isArray(adm.ipgyeol)) adm.ipgyeol = [];
    if (typeof deleteIndex === "number") {
      adm.ipgyeol.splice(deleteIndex, 1);
    } else if (entry) {
      adm.ipgyeol.push(entry);
    } else return j({ error: "entry 또는 deleteIndex 필요" }, 400);
    await env.DB.prepare("UPDATE programs SET admission = ? WHERE id = ?")
      .bind(JSON.stringify(adm), programId).run();
    return j({ ok: true, ipgyeol: adm.ipgyeol });
  } catch (e) { return j({ error: String(e.message || e) }, 500); }
}
