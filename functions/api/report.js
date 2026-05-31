// POST /api/report   { kidId, kind }   kind = "milestone" | "standard_map" | "standard_dx" | "standard_school"
// RAG + Opus 로 리포트 생성 → 자동 발행(저신뢰는 flagged). 결제 검증은 호출 전에 처리 가정.
import { askClaude, getKbContext, getPrompt, MODELS, json } from "../../lib/claude.js";

const KIND_GUIDE = {
  milestone:        "마일스톤(종합): 6단계 — ①지금 위치 ②수시 vs 정시 ③적합 전형 ④목표 시나리오 ⑤로드맵 ⑥점검 포인트.",
  standard_map:     "전형 지도: 아이가 노려볼 만한 전형 지형을 한눈에.",
  standard_dx:      "전형 진단: 현재 성적·활동으로 어떤 전형이 결에 맞는지.",
  standard_school:  "학교 분석: 우리 학교의 성취도·진학 경향과 그 안에서 아이의 위치."
};

const SYSTEM = `당신은 "대치파파"의 분석 엔진입니다. 아래 지식과 아이 프로필에 근거해 분석 리포트를 작성합니다.
원칙: 합격 보장/예측 금지, "참고용 분석" 전제, 작성 지도 금지. 근거(제공 지식) 안에서만 단정하고, 불확실하면 불확실하다고 명시.
출력은 JSON: {"sections":[{"title":"","body":""}], "confidence":0~1, "kb_refs":[]}. confidence 는 제공 지식으로 충분히 뒷받침되는 정도.`;

export async function onRequestPost({ request, env }) {
  try {
    const { kidId, kind = "milestone" } = await request.json();
    const kid = await env.DB.prepare("SELECT * FROM kids WHERE id = ?").bind(kidId).first();
    if (!kid) return json({ error: "아이를 찾을 수 없음" }, 404);

    const kb = await getKbContext(env, kid);
    const system = (await getPrompt(env, "report", SYSTEM));
    const user = `[리포트 종류] ${KIND_GUIDE[kind] || KIND_GUIDE.milestone}\n\n` +
      `[아이 프로필]\n${JSON.stringify(kid)}\n\n[참고 지식]\n${kb || "(지식 없음 — 일반론으로 제한)"}\n\n` +
      `위 지식에 근거해 리포트를 JSON 으로만 출력하세요.`;

    const raw = await askClaude(env, {
      model: MODELS.report, system,
      messages: [{ role: "user", content: user }], max_tokens: 4000
    });

    let parsed;
    try { parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()); }
    catch { parsed = { sections: [{ title: "분석", body: raw }], confidence: 0.5, kb_refs: [] }; }

    const conf = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
    const status = conf < 0.45 ? "flagged" : "published";   // 저신뢰 자동 플래그
    const id = "r_" + Date.now();

    await env.DB.prepare(
      "INSERT INTO reports (id,kid_id,kind,content,status,confidence,kb_refs) VALUES (?,?,?,?,?,?,?)"
    ).bind(id, kidId, kind, JSON.stringify(parsed.sections || []), status, conf,
           JSON.stringify(parsed.kb_refs || [])).run();

    return json({ id, status, confidence: conf, sections: parsed.sections || [] });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
