// POST /api/chat   { kidId, message }
// 아이별 대화: 그 아이 프로필 + live 지식(RAG)으로 Sonnet 응답
import { askClaude, getKbContext, getPrompt, MODELS, json } from "../../lib/claude.js";

const SYSTEM_FALLBACK = `당신은 "대치파파"입니다. 대입 수시를 분석하는 도우미입니다.
원칙: 합격을 보장하거나 예측하지 않습니다. "참고용 분석"임을 전제합니다.
자소서·면접·세특 등의 "작성 지도"는 하지 않습니다(분석만).
아래 제공된 지식과 아이 프로필에 근거해 따뜻하고 담백하게 답하세요. 근거 없는 단정은 피합니다.`;

export async function onRequestPost({ request, env }) {
  try {
    const { kidId, message } = await request.json();
    if (!kidId || !message) return json({ error: "kidId, message 필요" }, 400);

    const kid = await env.DB.prepare("SELECT * FROM kids WHERE id = ?").bind(kidId).first();
    if (!kid) return json({ error: "아이를 찾을 수 없음" }, 404);

    // 직전 대화 히스토리(아이별)
    const hist = await env.DB.prepare(
      "SELECT role, content FROM chats WHERE kid_id = ? ORDER BY created_at DESC LIMIT 12"
    ).bind(kidId).all();
    const history = (hist.results || []).reverse()
      .map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

    const kb = await getKbContext(env, kid);
    const system = (await getPrompt(env, "chat", SYSTEM_FALLBACK)) +
      `\n\n[아이 프로필]\n${JSON.stringify({ label: kid.label, school: kid.school, grade: kid.grade, track: kid.track, profile: kid.profile })}` +
      (kb ? `\n\n[참고 지식]\n${kb}` : "");

    const messages = [...history, { role: "user", content: message }];
    const answer = await askClaude(env, { model: MODELS.chat, system, messages, max_tokens: 1500 });

    // 저장(아이별)
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO chats (id,kid_id,role,content) VALUES (?,?,?,?)")
        .bind("c_" + now + "_u", kidId, "user", message),
      env.DB.prepare("INSERT INTO chats (id,kid_id,role,content) VALUES (?,?,?,?)")
        .bind("c_" + now + "_a", kidId, "assistant", answer)
    ]);

    return json({ answer });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
