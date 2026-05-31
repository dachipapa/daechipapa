// GET /api/admin/dashboard → 대시보드 지표
import { requireAdmin, j } from "../../../lib/auth.js";

export async function onRequest({ request, env }) {
  const g = requireAdmin(request, env); if (g) return g;
  if (request.method !== "GET") return j({ error: "GET only" }, 405);

  const [reports, users, flagged, revenue, credits] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS n FROM reports"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM parents"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE status='flagged'"),
    env.DB.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM payments WHERE status='paid'"),
    env.DB.prepare("SELECT COALESCE(SUM(delta),0) AS n FROM credits WHERE delta<0")
  ]);

  return j({
    reports:  reports.results?.[0]?.n || 0,
    users:    users.results?.[0]?.n || 0,
    flagged:  flagged.results?.[0]?.n || 0,
    revenue:  revenue.results?.[0]?.n || 0,
    credits_used: Math.abs(credits.results?.[0]?.n || 0)
  });
}
