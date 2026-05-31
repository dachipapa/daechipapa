// POST /api/report   { kidId, kind }
import { askClaude, getKbContext, getPrompt, MODELS, json } from "../../lib/claude.js";
import { checkRateLimit, tooMany, hasReportEntitlement } from "../../lib/limits.js";
import { profileStatus } from "../../lib/intake.js";

const KIND_GUIDE = {
  milestone:       "마일스톤(종합): 6단계 — ①지금 위치 ②수시 vs 정시 ③적합 전형 ④목표 시나리오 ⑤로드맵 ⑥점검 포인트.",
  standard_map:    "전형 지도: 노려볼 만한 전형 지형을 한눈에.",
  standard_dx:     "전형 진단: 현재 성적·활동으로 어떤 전형이 결에 맞는지.",
  standard_school: "학교 분석: 우리 학교의 성취도·진학 경향과 그 안에서 아이의 위치."
};

const SYSTEM = `당신은 "대치파파"의 분석 엔진입니다. 제공된 지식과 학생 프로필에 근거해 분석 리포트를 작성합니다.
원칙: 합격 보장/예측 금지, "참고용 분석" 전제, 작성 지도 금지. 제공 지식 안에서만 단정하고 불확실하면 명시.
반드시 유효한 JSON만 출력(마크다운·설명 없이):
{"sections":[{"title":"","body":""}],"kb_refs":[]}`;

function extractJson(raw) {
  let t = raw.replace(/```json|```/g, "").trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  return JSON.parse(t);
}

export async function onRequestPost({ request, env }) {
  try {
    const { kidId, kind = "milestone" } = await request.json();
    const kid = await env.DB.prepare("SELECT * FROM kids WHERE id = ?").bind(kidId).first();
    if (!kid) return json({ error: "아이를 찾을 수 없음" }, 404);

    // 결제 게이팅 (어드민 시크릿이면 테스트 허용)
    const adminHdr = request.headers.get("x-admin-secret") || "";
    const isAdminTest = env.ADMIN_SECRET && adminHdr === env.ADMIN_SECRET;
    if (!isAdminTest) {
      const ok = await hasReportEntitlement(env, kid.parent_id, kind);
      if (!ok) return json({ error: "결제가 필요한 리포트입니다.", code: "PAYMENT_REQUIRED" }, 402);
    }

    const rl = await checkRateLimit(env, "report:" + kidId, 10, 86400);
    if (!rl.ok) return tooMany(rl.retryAfter);

    // ── #4: 데이터 완성도 → 신뢰도 (모델 자가평가 대신) ──
    let profile = {};
    try { profile = kid.profile ? JSON.parse(kid.profile) : {}; } catch { profile = {}; }
    const status = profileStatus(profile);
    // 완성도 0~1 → 신뢰도 0.15~0.85 (완벽도 0%·100% 단정 회피)
    const dataConfidence = Math.round((0.15 + status.completeness * 0.70) * 100) / 100;

    const kb = await getKbContext(env, kid, KIND_GUIDE[kind] || "");
    const system = await getPrompt(env, "report", SYSTEM);
    const user = `[리포트 종류] ${KIND_GUIDE[kind] || KIND_GUIDE.milestone}\n\n` +
      `[아이 프로필]\n${JSON.stringify({ label: kid.label, school: kid.school, grade: kid.grade, track: kid.track, profile })}\n\n` +
      `[파악된 정보] ${status.known.join(", ") || "거의 없음"}\n` +
      `[부족한 정보] ${status.missing.join(", ") || "없음"}\n` +
      (status.missing.length
        ? `→ 부족한 정보 영역은 단정하지 말고 일반론으로 제한하라. 리포트 마지막에 어떤 정보를 더 주면 정확해지는지 안내하라.\n`
        : `→ 정보가 충분하니 구체적·정량적으로 분석하라.\n`) +
      `\n[참고 지식]\n${kb || "(지식 부족 — 일반론으로 제한)"}\n\n위 근거로 리포트를 JSON으로만 출력.`;

    const maxTok = kind === "milestone" ? 8000 : 4000;
    const raw = await askClaude(env, {
      model: MODELS.report, system,
      messages: [{ role: "user", content: user }], max_tokens: maxTok
    });

    let parsed, parseOk = true;
    try { parsed = extractJson(raw); }
    catch { parseOk = false; parsed = { sections: [{ title: "분석", body: raw }], kb_refs: [] }; }

    // 신뢰도 = 데이터 완성도 (파싱 실패 시 더 낮춤)
    const confidence = parseOk ? dataConfidence : Math.min(dataConfidence, 0.3);
    // flagged: 데이터 부족(신뢰도<0.45, 약 3/6 미만) 또는 파싱 실패 → 검수 대기
    const status_flag = (!parseOk || confidence < 0.45) ? "flagged" : "published";
    const id = "r_" + Date.now();

    await env.DB.prepare(
      "INSERT INTO reports (id,kid_id,kind,content,status,confidence,kb_refs) VALUES (?,?,?,?,?,?,?)"
    ).bind(id, kidId, kind, JSON.stringify(parsed.sections || []), status_flag, confidence,
           JSON.stringify(parsed.kb_refs || [])).run();

    return json({
      id, status: status_flag,
      confidence,
      data_completeness: Math.round(status.completeness * 100) / 100,
      known_info: status.known,
      missing_info: status.missing,
      sections: parsed.sections || []
    });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
