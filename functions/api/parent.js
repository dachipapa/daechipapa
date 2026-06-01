// POST /api/parent  { deviceId, source? }  → 기기 기반 부모 생성/조회 (내일 카카오 연동이 대체/연결)
// GET  /api/parent?parentId=  → 부모 + 아이 목록
import { json } from "../../lib/claude.js";

const PID = (d) => "p_" + String(d).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);

export async function onRequestPost({ request, env }) {
  try {
    const { deviceId, source } = await request.json();
    if (!deviceId) return json({ error: "deviceId 필요" }, 400);
    const id = PID(deviceId);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO parents (id, source, status) VALUES (?,?, 'active')"
    ).bind(id, source || "direct").run();
    const kids = await env.DB.prepare(
      "SELECT id,label,school,grade,track,cohort FROM kids WHERE parent_id=? ORDER BY created_at ASC"
    ).bind(id).all();
    return json({ parentId: id, kids: kids.results || [] });
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
}

export async function onRequestGet({ request, env }) {
  try {
    const parentId = new URL(request.url).searchParams.get("parentId");
    if (!parentId) return json({ error: "parentId 필요" }, 400);
    const p = await env.DB.prepare("SELECT id,nickname,name,email,phone,provider,source,status FROM parents WHERE id=?").bind(parentId).first();
    if (!p) return json({ error: "부모 없음" }, 404);
    const kids = await env.DB.prepare(
      "SELECT id,label,school,grade,track,cohort FROM kids WHERE parent_id=? ORDER BY created_at ASC"
    ).bind(parentId).all();
    let logins = [];
    try { const ids = await env.DB.prepare("SELECT provider FROM auth_identities WHERE parent_id=?").bind(parentId).all(); logins = (ids.results || []).map(r => r.provider); } catch (_) {}
    p.logins = logins;
    return json({ parent: p, kids: kids.results || [] });
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
}
