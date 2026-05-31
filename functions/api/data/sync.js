// POST /api/data/sync  { sido: "11"|"41"|..., schulKnd?: "04", apiType?: "0" }
// 학교알리미 OpenAPI 수집 → D1 (전국 시도/시군구 + 학교특성 캡처)
// 시크릿: SCHOOLINFO_API_KEY (schoolinfo.go.kr 카카오 로그인 → 마이페이지)
import { requireAdmin, j } from "../../../lib/auth.js";

// 전국 17개 시도 → 시군구코드 (시도시군구코드.xlsx, 257개)
const SGG = {
  "11": ["11140","11560","11230","11260","11380","11545","11590","11680","11110","11170","11215","11470","11410","11440","11200","11305","11650","11710","11740","11290","11320","11350","11500","11530","11620"],
  "26": ["26350","26140","26500","26260","26110","26440","26710","26170","26410","26530","26290","26200","26470","26230","26320","26380"],
  "27": ["27170","27290","27200","27720","27110","27260","27230","27140","27710"],
  "28": ["28140","28720","28185","28260","28110","28710","28245","28237","28177","28200"],
  "29": ["29140","29200","29170","29155","29110"],
  "30": ["30110","30230","30170","30140","30200"],
  "31": ["31110","31170","31710","31140","31200"],
  "36": ["36110"],
  "41": ["41111","41285","41150","41360","41370","41390","41461","41192","41194","41196","41110","41115","41130","41135","41173","41220","41271","41281","41287","41310","41430","41463","41480","41570","41610","41650","41670","41820","41550","41590","41117","41210","41273","41630","41800","41250","41830","41170","41131","41450","41113","41290","41410","41465","41500","41171","41133"],
  "43": ["43770","43800","43111","43113","43130","43720","43740","43745","43760","43730","43112","43150","43114","43750"],
  "44": ["44131","44770","44200","44760","44133","44150","44210","44250","44710","44790","44810","44825","44270","44800","44180","44230"],
  "46": ["46710","46720","46770","46800","46840","46130","46170","46780","46790","46830","46870","46890","46900","46820","46230","46910","46810","46860","46880","46110","46150","46730"],
  "47": ["47290","47840","47111","47850","47830","47190","47920","47110","47940","47280","47170","47130","47770","47760","47750","47730","47250","47230","47150","47113","47930","47900","47820","47210"],
  "48": ["48720","48240","48820","48129","48125","48840","48170","48120","48890","48870","48850","48740","48730","48330","48310","48250","48220","48127","48123","48880","48270","48860","48121"],
  "50": ["50130","50110"],
  "51": ["51150","51110","51770","51830","51820","51800","51780","51760","51720","51230","51190","51790","51750","51810","51130","51170","51730","51210"],
  "52": ["52770","52730","52710","52210","52130","52113","52111","52750","52180","52790","52190","52720","52800","52140","52740"]
};
const SIDO_NAME = {"11": "서울특별시", "26": "부산광역시", "27": "대구광역시", "28": "인천광역시", "29": "광주광역시", "30": "대전광역시", "31": "울산광역시", "36": "세종특별자치시", "41": "경기도", "43": "충청북도", "44": "충청남도", "46": "전라남도", "47": "경상북도", "48": "경상남도", "50": "제주특별자치도", "51": "강원특별자치도", "52": "전북특별자치도"};
const KND_NAME = { "02":"초등학교","03":"중학교","04":"고등학교","05":"특수학교" };

export async function onRequest({ request, env }) {
  const g = requireAdmin(request, env); if (g) return g;
  if (request.method !== "POST") return j({ error: "POST only" }, 405);

  const { sido = "11", schulKnd = "04", apiType = "0" } = await request.json().catch(() => ({}));
  const apiKey = env.SCHOOLINFO_API_KEY;
  if (!apiKey) return j({ error: "SCHOOLINFO_API_KEY 시크릿이 없습니다." }, 400);

  const sggList = SGG[sido];
  if (!sggList) return j({ error: "시도코드 목록: " + Object.keys(SGG).join(",") }, 400);

  let fetched = 0, inserted = 0, errors = 0;
  const sample = [];
  for (const sgg of sggList) {
    try {
      const url = `https://www.schoolinfo.go.kr/openApi.do?apiKey=${encodeURIComponent(apiKey)}&apiType=${apiType}&sidoCode=${sido}&sggCode=${sgg}&schulKndCode=${schulKnd}`;
      const res = await fetch(url);
      const data = await res.json();
      const list = data.list || [];
      fetched += list.length;
      const stmts = [];
      for (const r of list) {
        const code = r.SCHUL_CODE, name = r.SCHUL_NM;
        if (!code || !name) { errors++; continue; }
        if (sample.length < 5) sample.push(`${name}(${r.HS_KND_SC_NM||"?"})`);
        const addr = [r.SCHUL_RDNMA, r.SCHUL_RDNDA].filter(Boolean).join(" ") || r.ADRES_BRKDN || "";
        stmts.push(env.DB.prepare(
          "INSERT OR REPLACE INTO schools (id,name,region,type,data,source,year,updated_at) VALUES (?,?,?,?,?,?,?,?)"
        ).bind(
          "si_" + code, name,
          r.ADRCD_NM || SIDO_NAME[sido] || "",
          r.HS_KND_SC_NM || KND_NAME[schulKnd] || "",
          JSON.stringify({
            code, addr,
            tel: r.USER_TELNO || "",
            office: r.ATPT_OFCDC_ORG_NM || "",
            sido: SIDO_NAME[sido] || "",
            fondType: r.FOND_SC_CODE || "",
            course: r.SCHUL_CRSE_SC_VALUE_NM || "",
            founded: r.FOND_YMD || ""
          }),
          "학교알리미", new Date().getFullYear(), Date.now()
        ));
      }
      if (stmts.length) { await env.DB.batch(stmts); inserted += stmts.length; }
    } catch (e) { errors++; }
  }
  return j({ ok: true, sido, sidoName: SIDO_NAME[sido], schulKnd,
             fetched, inserted, errors, sample,
             message: `${SIDO_NAME[sido]} ${KND_NAME[schulKnd]} ${inserted}개 저장 (수집 ${fetched})` });
}
