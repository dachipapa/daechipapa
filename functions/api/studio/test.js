// POST /api/studio/test { kidProfile, includeDraft? }
// draft 포함 KB로 대치파파가 어떻게 답하는지 미리보기
import { requireAdmin, j } from "../../../lib/auth.js";
import { askClaude, MODELS } from "../../../lib/claude.js";

export async function onRequest({ request, env }) {
  const g = requireAdmin(request, env); if (g) return g;
  if (request.method !== "POST") return j({ error: "POST only" }, 405);

  const { kidProfile, message = "이 아이의 수시·정시 방향을 분석해주세요.", includeDraft = true } = await request.json();

  const statusFilter = includeDraft ? "status IN ('live','draft')" : "status='live'";
  const rules = await env.DB.prepare(`SELECT content FROM rules WHERE ${statusFilter} LIMIT 40`).all();
  const rulesStr = (rules.results || []).map(r => "- " + r.content).join("\n");

  const system = `[테스트 모드 — Studio 미리보기]
당신은 대치파파입니다. 아래 지식으로 가상의 아이를 분석합니다.
원칙: 합격 보장 금지, 참고용 분석.

## 현재 적용 중인 해석 규칙
${rulesStr || "(규칙 없음)"}`;

  const answer = await askClaude(env, {
    model: MODELS.chat,
    system,
    messages: [
      { role: "user", content: `[가상 아이 프로필]\n${JSON.stringify(kidProfile || {})}\n\n${message}` }
    ],
    max_tokens: 1500
  });

  return j({ answer, rulesUsed: rules.results?.length || 0, draft: includeDraft });
}
