// POST /api/studio/ipgyeol-import  { rows: [{uni,program,year,type,name,quota,method,minSuneung,cut70,cut50,note}] }
// 대학명+학과명으로 매칭해 입결·전형 일괄 반영. 매칭 실패는 리포트.
import { requireAdmin, j } from "../../../lib/auth.js";

function stem(s){ return String(s||"").replace(/\(.*?\)/g,"").replace(/(대학교|대)$/u,"").replace(/\s/g,"").trim(); }

export async function onRequestPost({ request, env }) {
  const g = requireAdmin(request, env); if (g) return g;
  try {
    const { rows } = await request.json();
    if (!Array.isArray(rows) || !rows.length) return j({ error: "rows 배열 필요" }, 400);
    if (rows.length > 400) return j({ error: "한 번에 최대 400행. 나눠서 올려주세요." }, 400);

    let applied = 0; const unmatched = [];
    for (const r of rows) {
      const uniName = r.uni || r["대학명"];
      const progName = r.program || r["학과명"];
      if (!uniName || !progName) { unmatched.push({ uni: uniName||"", program: progName||"", reason: "대학/학과 비어있음" }); continue; }
      const u = await env.DB.prepare(
        "SELECT id FROM universities WHERE REPLACE(name,' ','') LIKE ? ORDER BY length(name) ASC LIMIT 1"
      ).bind("%" + stem(uniName) + "%").first();
      if (!u) { unmatched.push({ uni: uniName, program: progName, reason: "대학 매칭 실패" }); continue; }
      const ps = await env.DB.prepare(
        "SELECT id, name FROM programs WHERE university_id = ? AND name LIKE ? LIMIT 3"
      ).bind(u.id, "%" + String(progName).trim() + "%").all();
      const list = ps.results || [];
      if (list.length !== 1) { unmatched.push({ uni: uniName, program: progName, reason: list.length ? "학과 중복("+list.length+")" : "학과 매칭 실패" }); continue; }
      const pid = list[0].id;
      const p = await env.DB.prepare("SELECT admission FROM programs WHERE id = ?").bind(pid).first();
      let adm = {}; try { adm = JSON.parse(p.admission || "{}"); } catch { adm = {}; }
      if (!Array.isArray(adm.ipgyeol)) adm.ipgyeol = [];
      adm.ipgyeol.push({
        year: r.year || r["연도"] || "", type: r.type || r["전형구분"] || "",
        name: r.name || r["전형명"] || "", quota: r.quota || r["모집인원"] || "",
        method: r.method || r["전형방법"] || "", minSuneung: r.minSuneung || r["수능최저"] || "",
        cut70: r.cut70 || r["70%컷"] || r["70퍼컷"] || "", cut50: r.cut50 || r["50%컷"] || r["50퍼컷"] || "",
        note: r.note || r["메모"] || ""
      });
      await env.DB.prepare("UPDATE programs SET admission = ? WHERE id = ?").bind(JSON.stringify(adm), pid).run();
      applied++;
    }
    return j({ ok: true, total: rows.length, applied, unmatchedCount: unmatched.length, unmatched: unmatched.slice(0, 50) });
  } catch (e) { return j({ error: String(e.message || e) }, 500); }
}
