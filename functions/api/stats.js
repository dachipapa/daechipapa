// GET /api/stats — 공개 집계 (랜딩페이지용, 인증 불필요). Studio가 데이터 갱신하면 자동 반영.
import { json } from "../../lib/claude.js";

export async function onRequest({ env }) {
  const one = async (sql) => (await env.DB.prepare(sql).first()) || {};
  try {
    const s = await one("SELECT COUNT(*) c FROM schools");
    const u = await one("SELECT COUNT(*) c FROM universities");
    const p = await one("SELECT COUNT(*) c FROM programs");
    const r = await one("SELECT COUNT(*) c FROM rules WHERE status='live'");
    const reg = await one("SELECT COUNT(DISTINCT region) c FROM schools");
    const ipg = await one("SELECT COUNT(*) c FROM programs WHERE admission LIKE '%ipgyeol%'");
    return new Response(JSON.stringify({
      schools: s.c || 0, universities: u.c || 0, programs: p.c || 0,
      rules: r.c || 0, regions: reg.c || 0, ipgyeol: ipg.c || 0
    }), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=600", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    return json({ schools: 0, universities: 0, programs: 0, rules: 0, regions: 0, ipgyeol: 0 });
  }
}
