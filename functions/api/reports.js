// GET /api/reports?kidId=   아이의 리포트 목록
//     /api/reports?parentId= 부모의 모든 아이 리포트
//     /api/reports?id=       단건(섹션 내용 포함)
import { json } from "../../lib/claude.js";

export async function onRequestGet({ request, env }) {
  try {
    const u = new URL(request.url);
    const id = u.searchParams.get("id");
    const kidId = u.searchParams.get("kidId");
    const parentId = u.searchParams.get("parentId");

    if (id) {
      const r = await env.DB.prepare("SELECT * FROM reports WHERE id=?").bind(id).first();
      if (!r) return json({ error: "리포트 없음" }, 404);
      let sections = []; try { sections = JSON.parse(r.content || "[]"); } catch {}
      return json({ report: { id: r.id, kid_id: r.kid_id, kind: r.kind, status: r.status, confidence: r.confidence, created_at: r.created_at, sections } });
    }
    let rows;
    if (kidId) {
      rows = await env.DB.prepare(
        "SELECT id,kid_id,kind,status,confidence,created_at FROM reports WHERE kid_id=? ORDER BY created_at DESC LIMIT 50"
      ).bind(kidId).all();
    } else if (parentId) {
      rows = await env.DB.prepare(
        "SELECT r.id,r.kid_id,r.kind,r.status,r.confidence,r.created_at,k.label FROM reports r JOIN kids k ON k.id=r.kid_id WHERE k.parent_id=? ORDER BY r.created_at DESC LIMIT 50"
      ).bind(parentId).all();
    } else return json({ error: "kidId 또는 parentId 필요" }, 400);
    return json({ reports: rows.results || [] });
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
}
