// POST /api/studio/analyze { noteId }
// Claude(Haiku)가 원자료를 사실/해석 규칙으로 분리해 초안 반환
import { requireAdmin, j } from "../../../lib/auth.js";
import { askClaude, MODELS } from "../../../lib/claude.js";

const SYSTEM = `당신은 대입 입시 지식 큐레이터입니다.
주어진 원자료에서 아래를 분리하고 JSON만 출력하세요(다른 텍스트 없이):
{
  "facts": [{ "target": "학교명 또는 대학명", "field": "항목명", "value": "값", "year": 2026 }],
  "rules": [{ "content": "해석 규칙 한 문장", "category": "전형판단|전형적합|평가환경|성적해석|기타", "confidence": 0.0~1.0 }],
  "conflicts": ["기존 지식과 충돌 가능한 내용 설명 (없으면 빈 배열)"]
}
facts는 검증 가능한 숫자·사실만. rules는 평가자 시선의 해석만. 불확실하면 confidence 낮게.`;

export async function onRequest({ request, env }) {
  const g = requireAdmin(request, env); if (g) return g;
  if (request.method !== "POST") return j({ error: "POST only" }, 405);

  const { noteId } = await request.json();
  const note = await env.DB.prepare("SELECT * FROM raw_notes WHERE id=?").bind(noteId).first();
  if (!note) return j({ error: "노트를 찾을 수 없음" }, 404);

  // 기존 live 규칙 일부 — 충돌 감지용
  const existing = await env.DB.prepare(
    "SELECT content FROM rules WHERE status='live' LIMIT 20"
  ).all();
  const existingStr = (existing.results || []).map(r => r.content).join("\n");

  const raw = await askClaude(env, {
    model: MODELS.cheap,
    system: SYSTEM,
    messages: [{
      role: "user",
      content: `[원자료]\n${note.body}\n\n[기존 live 규칙(충돌 체크용)]\n${existingStr || "(없음)"}`
    }],
    max_tokens: 2000
  });

  let parsed;
  try { parsed = JSON.parse(raw.replace(/```json|```/g, "").trim()); }
  catch { parsed = { facts: [], rules: [], conflicts: [], raw }; }

  // 노트 상태를 '분석중'으로 업데이트
  await env.DB.prepare("UPDATE raw_notes SET status='analyzed' WHERE id=?").bind(noteId).run();

  return j({ noteId, ...parsed });
}
