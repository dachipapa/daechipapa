// GET /api/studio/data-status — 데이터 수집 현황 (admin)
import { requireAdmin, j } from "../../../lib/auth.js";

export async function onRequest({ request, env }) {
  const g = requireAdmin(request, env); if (g) return g;
  const one = async (sql) => (await env.DB.prepare(sql).first()) || {};
  try {
    const s = await one("SELECT COUNT(*) c, MAX(updated_at) u FROM schools");
    const u = await one("SELECT COUNT(*) c FROM universities");
    const p = await one("SELECT COUNT(*) c FROM programs");
    const r = await one("SELECT COUNT(*) c FROM rules WHERE status='live'");
    const cap = await one("SELECT COUNT(*) c FROM universities WHERE data LIKE '%capacity%'");
    const ipg = await one("SELECT COUNT(*) c FROM programs WHERE admission LIKE '%ipgyeol%'");
    const regions = await one("SELECT COUNT(DISTINCT region) c FROM schools");
    const types = (await env.DB.prepare(
      "SELECT type, COUNT(*) c FROM schools GROUP BY type ORDER BY c DESC LIMIT 6"
    ).all()).results || [];
    return j({
      schools: s.c || 0, schoolsUpdated: s.u || null, regions: regions.c || 0,
      universities: u.c || 0, programs: p.c || 0, rules: r.c || 0,
      capacity: cap.c || 0, ipgyeol: ipg.c || 0,
      schoolTypes: types
    });
  } catch (e) {
    return j({ error: String(e.message || e) }, 500);
  }
}
