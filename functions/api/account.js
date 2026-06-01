// DELETE /api/account  { deviceId }  — 본인 탈퇴·데이터 삭제 (개인정보보호법). 명시적 cascade.
import { json } from "../../lib/claude.js";

const PID = (d) => "p_" + String(d).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);

export async function onRequestDelete({ request, env }) {
  try {
    const b = await request.json();
    const pid = b.parentId || (b.deviceId ? PID(b.deviceId) : null);
    if (!pid) return json({ error: "deviceId 필요" }, 400);

    const kids = await env.DB.prepare("SELECT id FROM kids WHERE parent_id=?").bind(pid).all();
    const kidIds = (kids.results || []).map(k => k.id);
    const stmts = [];
    for (const kid of kidIds) {
      stmts.push(env.DB.prepare("DELETE FROM chats WHERE kid_id=?").bind(kid));
      stmts.push(env.DB.prepare("DELETE FROM schedules WHERE kid_id=?").bind(kid));
      stmts.push(env.DB.prepare("DELETE FROM reports WHERE kid_id=?").bind(kid));
    }
    stmts.push(env.DB.prepare("DELETE FROM kids WHERE parent_id=?").bind(pid));
    stmts.push(env.DB.prepare("DELETE FROM credits WHERE parent_id=?").bind(pid));
    stmts.push(env.DB.prepare("DELETE FROM payments WHERE parent_id=?").bind(pid));
    stmts.push(env.DB.prepare("DELETE FROM parents WHERE id=?").bind(pid));
    await env.DB.batch(stmts);
    // 계정연결 테이블 정리 (테이블 미존재 환경에서도 안전하게 best-effort)
    try { await env.DB.prepare("DELETE FROM auth_identities WHERE parent_id=?").bind(pid).run(); } catch (_) {}
    try { await env.DB.prepare("DELETE FROM device_links WHERE parent_id=?").bind(pid).run(); } catch (_) {}
    return json({ ok: true, deletedKids: kidIds.length });
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
}
