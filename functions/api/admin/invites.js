// /api/admin/invites — 초대코드 관리 + 유입 경로 분석 (admin)
// GET  → 코드 목록 + 가입 경로(source)별 집계
// POST { code, source, maxUses } → 코드 생성
// PATCH { code, status } → 활성/비활성
import { requireAdmin, j } from "../../../lib/auth.js";

export async function onRequest({ request, env }) {
  const g = requireAdmin(request, env); if (g) return g;

  if (request.method === "GET") {
    let invites = [];
    try {
      const r = await env.DB.prepare(
        "SELECT code, source, max_uses, used, status, created_at FROM invites ORDER BY created_at DESC LIMIT 100"
      ).all();
      invites = r.results || [];
    } catch { invites = []; } // 테이블 없으면 빈 목록
    const src = await env.DB.prepare(
      "SELECT COALESCE(NULLIF(source,''),'direct') AS s, COUNT(*) AS c FROM parents GROUP BY s ORDER BY c DESC"
    ).all();
    return j({ invites, sources: src.results || [] });
  }

  if (request.method === "POST") {
    const { code, source, maxUses } = await request.json();
    if (!code) return j({ error: "code 필요" }, 400);
    await env.DB.prepare(
      "INSERT OR REPLACE INTO invites (code, source, max_uses, used, status) VALUES (?,?,?, COALESCE((SELECT used FROM invites WHERE code=?),0), 'active')"
    ).bind(code, source || "", maxUses || 0, code).run();
    return j({ ok: true, code });
  }

  if (request.method === "PATCH") {
    const { code, status } = await request.json();
    if (!code) return j({ error: "code 필요" }, 400);
    await env.DB.prepare("UPDATE invites SET status=? WHERE code=?").bind(status || "disabled", code).run();
    return j({ ok: true });
  }
  return j({ error: "Method not allowed" }, 405);
}
