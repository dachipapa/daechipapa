// 대화형 인테이크 — 메시지에서 구조화 프로필 추출 + 학교 매칭 + 완성도 + 대화 가이드
import { askClaude, MODELS } from "./claude.js";

const EXTRACT_SYSTEM = `당신은 입시 상담 대화에서 학생 프로필을 추출·갱신하는 도우미입니다.
[기존 프로필]에 [새 메시지]에서 새로 파악되는 정보만 병합해 전체 프로필 JSON을 출력합니다.
규칙:
- 명시적으로 언급된 정보만. 추측·창작 절대 금지.
- 새 메시지에 없는 항목은 기존 값 그대로 유지.
- JSON만 출력 (설명·마크다운 없이).
스키마:
{
 "school": "학생이 말한 학교명 그대로 (예: 휘문고, 대치고, 단대부고)|null",
 "school_type": "일반고|자사고|특목고|검정고시|해외고|특성화고|null",
 "naesin": {"overall": number|null, "main": number|null, "trend": "상승|유지|하락|null"},
 "mopyeong": {"korean": number|null, "math": number|null, "english": number|null, "tamgu": number|null, "trend": "상승|유지|하락|null"},
 "subjects": {"math": "미적분|기하|확률과통계|null", "tamgu": [string]},
 "goal": {"majors": [string], "universities": [string]},
 "activities": [string]
}`;

export async function extractProfile(env, current, message) {
  try {
    const raw = await askClaude(env, {
      model: MODELS.cheap,
      system: EXTRACT_SYSTEM,
      messages: [{ role: "user", content: `[기존 프로필]\n${JSON.stringify(current || {})}\n\n[새 메시지]\n${message}` }],
      max_tokens: 700
    });
    let t = raw.replace(/```json|```/g, "").trim();
    const s = t.indexOf("{"), e = t.lastIndexOf("}");
    if (s >= 0 && e > s) t = t.slice(s, e + 1);
    const parsed = JSON.parse(t);
    return parsed && typeof parsed === "object" ? parsed : (current || {});
  } catch {
    return current || {};
  }
}

// 학교명 정규화 (어미 제거)
function stem(name) {
  return String(name || "").replace(/(자율형사립고등학교|여자고등학교|고등학교|중학교|여고|고|중)$/u, "").trim();
}

// 사용자가 말한 학교명 → schools 테이블의 정확한 학교로 매칭
// 반환: { name(정식명), code, candidates[] } 또는 null
export async function matchSchool(env, mention) {
  const st = stem(mention);
  if (!st || st.length < 1) return null;
  try {
    const res = await env.DB.prepare(
      "SELECT name, data FROM schools WHERE name LIKE ? ORDER BY length(name) ASC LIMIT 5"
    ).bind("%" + st + "%").all();
    const rows = res.results || [];
    if (!rows.length) return null;
    let code = null; try { code = JSON.parse(rows[0].data).code; } catch {}
    return { name: rows[0].name, code, candidates: rows.map(r => r.name) };
  } catch { return null; }
}

export function profileStatus(p) {
  p = p || {};
  const checks = {
    "학교": !!(p.school_matched || p.school_type),
    "내신 등급": !!(p.naesin && p.naesin.overall != null),
    "모의고사 등급": !!(p.mopyeong && (p.mopyeong.math != null || p.mopyeong.korean != null)),
    "선택과목": !!(p.subjects && (p.subjects.math || (p.subjects.tamgu && p.subjects.tamgu.length))),
    "목표 학과/대학": !!(p.goal && ((p.goal.majors && p.goal.majors.length) || (p.goal.universities && p.goal.universities.length))),
    "주요 활동": !!(p.activities && p.activities.length)
  };
  const known = Object.keys(checks).filter(k => checks[k]);
  const missing = Object.keys(checks).filter(k => !checks[k]);
  return { known, missing, completeness: known.length / Object.keys(checks).length };
}

export function intakeGuidance(profile) {
  const { known, missing } = profileStatus(profile);
  let g = `\n\n[현재 파악된 학생 정보]\n${JSON.stringify(profile || {})}\n`;
  g += `[파악됨] ${known.join(", ") || "아직 없음"}\n[아직 모름] ${missing.join(", ") || "충분함"}\n`;
  // 학교 매칭 안내
  if (profile && profile.school && !profile.school_matched) {
    g += `참고: 사용자가 "${profile.school}"라고 했으나 정확한 학교를 특정하지 못했습니다. 정확한 학교명(예: 휘문고등학교)을 자연스럽게 확인하세요.\n`;
  } else if (profile && profile.school_matched) {
    g += `확정된 학교: ${profile.school_matched}\n`;
  }
  if (missing.length) {
    g += `대화 지침: 사용자 질문에 먼저 충실히 답하라. 그 다음, 분석 정확도를 높이기 위해 위 '아직 모름' 항목 중 딱 1개만 자연스럽게 대화에 녹여 물어라. 설문하듯 한꺼번에 캐묻지 말고, 이미 아는 정보는 다시 묻지 마라.`;
  } else {
    g += `대화 지침: 핵심 정보가 충분하다. 이제 구체적·정량적 분석에 집중하라.`;
  }
  return g;
}
