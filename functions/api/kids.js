// /api/kids  — 아이 프로필 CRUD (부모당 최대 3)
// GET    ?parentId=   목록  |  ?kidId=  단건(profile 포함)
// POST   { parentId, label, school, grade, track, cohort }   생성
// PUT    { kidId, label?, school?, grade?, track?, cohort? }  수정
// DELETE { kidId }                                            삭제
import { json } from "../../lib/claude.js";

export async function onRequestGet({ request, env }) {
  try {
    const u = new URL(request.url);
    const parentId = u.searchParams.get("parentId");
    const kidId = u.searchParams.get("kidId");
    if (kidId) {
      const k = await env.DB.prepare("SELECT * FROM kids WHERE id=?").bind(kidId).first();
      if (!k) return json({ error: "아이 없음" }, 404);
      let profile = {}; try { profile = k.profile ? JSON.parse(k.profile) : {}; } catch {}
      return json({ kid: { ...k, profile } });
    }
    if (!parentId) return json({ error: "parentId 또는 kidId 필요" }, 400);
    const r = await env.DB.prepare(
      "SELECT id,label,school,grade,track,cohort FROM kids WHERE parent_id=? ORDER BY created_at ASC"
    ).bind(parentId).all();
    return json({ kids: r.results || [] });
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
}

export async function onRequestPost({ request, env }) {
  try {
    const b = await request.json();
    if (!b.parentId) return json({ error: "parentId 필요" }, 400);
    // 부모 존재 확인 (없으면 생성 — 기기 기반 안전장치)
    await env.DB.prepare("INSERT OR IGNORE INTO parents (id,status) VALUES (?, 'active')").bind(b.parentId).run();
    const cnt = await env.DB.prepare("SELECT COUNT(*) c FROM kids WHERE parent_id=?").bind(b.parentId).first();
    if ((cnt?.c || 0) >= 3) return json({ error: "아이는 최대 3명까지 등록할 수 있어요.", code: "MAX_KIDS" }, 400);
    const id = "k_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
    await env.DB.prepare(
      "INSERT INTO kids (id,parent_id,label,school,grade,track,cohort,profile) VALUES (?,?,?,?,?,?,?,?)"
    ).bind(id, b.parentId, b.label || "아이", b.school || "", b.grade || "", b.track || "", b.cohort ? String(b.cohort) : "", "{}").run();
    return json({ ok: true, kidId: id, kid: { id, label: b.label || "아이", school: b.school || "", grade: b.grade || "", track: b.track || "", cohort: b.cohort || "" } });
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
}

export async function onRequestPut({ request, env }) {
  try {
    const b = await request.json();
    if (!b.kidId) return json({ error: "kidId 필요" }, 400);
    const k = await env.DB.prepare("SELECT * FROM kids WHERE id=?").bind(b.kidId).first();
    if (!k) return json({ error: "아이 없음" }, 404);
    const fields = ["label", "school", "grade", "track", "cohort"];
    const set = [], vals = [];
    for (const f of fields) if (b[f] !== undefined) { set.push(f + "=?"); vals.push(f === "cohort" ? String(b[f]) : b[f]); }
    if (!set.length) return json({ error: "수정할 항목 없음" }, 400);
    vals.push(b.kidId);
    await env.DB.prepare("UPDATE kids SET " + set.join(",") + " WHERE id=?").bind(...vals).run();
    return json({ ok: true });
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
}

export async function onRequestDelete({ request, env }) {
  try {
    const b = await request.json();
    if (!b.kidId) return json({ error: "kidId 필요" }, 400);
    await env.DB.prepare("DELETE FROM kids WHERE id=?").bind(b.kidId).run();
    return json({ ok: true });
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
}
