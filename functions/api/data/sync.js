import { requireAdmin, j } from "../../../lib/auth.js";

async function fetchNeisSchools(apiKey, region = "서울") {
  const results = [];
  let page = 1;
  while (true) {
    const url = `https://open.neis.go.kr/hub/schoolInfo?KEY=${apiKey}&Type=json&pIndex=${page}&pSize=100&LCTN_SC_NM=${encodeURIComponent(region)}&SCHUL_KND_SC_NM=${encodeURIComponent("고등학교")}`;
    const res = await fetch(url);
    const data = await res.json();
    const rows = data?.schoolInfo?.[1]?.row;
    if (!rows || rows.length === 0) break;
    for (const r of rows) {
      results.push({
        id: "neis_" + r.SD_SCHUL_CODE,
        name: r.SCHUL_NM,
        region: r.LCTN_SC_NM,
        type: r.SCHUL_KND_SC_NM,
        data: JSON.stringify({ address: r.ORG_RDNMA, phone: r.ORG_TELNO, code: r.SD_SCHUL_CODE, edu_office: r.ATPT_OFCDC_SC_NM }),
        source: "NEIS",
        year: new Date().getFullYear()
      });
    }
    if (rows.length < 100) break;
    page++;
  }
  return results;
}

export async function onRequest({ request, env }) {
  const g = requireAdmin(request, env); if (g) return g;
  if (request.method !== "POST") return j({ error: "POST only" }, 405);
  const { region = "서울" } = await request.json().catch(() => ({}));
  const neisKey = env.NEIS_API_KEY;
  if (!neisKey) return j({ error: "NEIS_API_KEY 시크릿이 없습니다. wrangler pages secret put NEIS_API_KEY 로 등록해주세요." }, 400);
  const schools = await fetchNeisSchools(neisKey, region);
  let inserted = 0, errors = 0;
  for (const s of schools) {
    try {
      await env.DB.prepare("INSERT OR REPLACE INTO schools (id,name,region,type,data,source,year,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(s.id, s.name, s.region, s.type, s.data, s.source, s.year, Date.now()).run();
      inserted++;
    } catch { errors++; }
  }
  return j({ ok: true, region, inserted, errors, message: `${region} 고등학교 ${inserted}개 저장됨` });
}
