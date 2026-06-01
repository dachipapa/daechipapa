// /api/schedules — 우리 아이 매니저(학원 일정/후보)
// GET ?kidId= 목록 · POST 추가 · PUT {id,scheduled} 일정 올림/내림 · DELETE {id}
import { json } from "../../lib/claude.js";

export async function onRequestGet({ request, env }) {
  try {
    const kidId = new URL(request.url).searchParams.get("kidId");
    if (!kidId) return json({ error: "kidId 필요" }, 400);
    const r = await env.DB.prepare(
      "SELECT id,subject,academy,teacher,days,start_hour,end_hour,scheduled FROM schedules WHERE kid_id=? ORDER BY created_at ASC"
    ).bind(kidId).all();
    const list = (r.results || []).map(s => ({
      id: s.id, subject: s.subject, academy: s.academy, teacher: s.teacher,
      days: (() => { try { return JSON.parse(s.days || "[]"); } catch { return []; } })(),
      start: s.start_hour, end: s.end_hour, scheduled: s.scheduled ? 1 : 0
    }));
    return json({ schedules: list });
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
}

export async function onRequestPost({ request, env }) {
  try {
    const b = await request.json();
    if (!b.kidId || !b.subject) return json({ error: "kidId, subject 필요" }, 400);
    const id = "sch_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    await env.DB.prepare(
      "INSERT INTO schedules (id,kid_id,subject,academy,teacher,days,start_hour,end_hour,scheduled) VALUES (?,?,?,?,?,?,?,?,?)"
    ).bind(id, b.kidId, b.subject, b.academy || "", b.teacher || "",
           JSON.stringify(b.days || []), b.startHour || null, b.endHour || null, b.scheduled ? 1 : 0).run();
    return json({ ok: true, id });
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
}

export async function onRequestPut({ request, env }) {
  try {
    const b = await request.json();
    if (!b.id) return json({ error: "id 필요" }, 400);
    await env.DB.prepare("UPDATE schedules SET scheduled=? WHERE id=?").bind(b.scheduled ? 1 : 0, b.id).run();
    return json({ ok: true });
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
}

export async function onRequestDelete({ request, env }) {
  try {
    const b = await request.json();
    if (!b.id) return json({ error: "id 필요" }, 400);
    await env.DB.prepare("DELETE FROM schedules WHERE id=?").bind(b.id).run();
    return json({ ok: true });
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
}
