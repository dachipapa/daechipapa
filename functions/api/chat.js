// POST /api/chat   { kidId, message }
import { askClaude, getKbContext, getPrompt, MODELS, json } from "../../lib/claude.js";
import { checkRateLimit, tooMany } from "../../lib/limits.js";

const SYSTEM_FALLBACK = `당신은 "대치파파"입니다. 대입 수시를 분석하는 도우미입니다.
원칙: 합격을 보장하거나 예측하지 않습니다. "참고용 분석"임을 전제합니다.
자소서·면접·세특 등의 "작성 지도"는 하지 않습니다(분석만).
제공된 지식과 아이 프로필에 근거해 따뜻하고 담백하게 답하세요. 근거 없는 단정은 피합니다.`;

export async function onRequestPost({ request, env }) {
  try {
    const { kidId, message } = await request.json();
    if (!kidId || !message) return json({ error: "kidId, message 필요" }, 400);
    if (message.length > 2000) return json({ error: "메시지가 너무 깁니다." }, 400);

    // rate limit: 아이당 시간당 40회
    const rl = await checkRateLimit(env, "chat:" + kidId, 40, 3600);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const kid = await env.DB.prepare("SELECT * FROM kids WHERE id = ?").bind(kidId).first();
    if (!kid) return json({ error: "아이를 찾을 수 없음" }, 404);

    // 히스토리(아이별, 최신 12개) — created_at(ms) 기준 정렬
    const hist = await env.DB.prepare(
      "SELECT role, content FROM chats WHERE kid_id = ? ORDER BY created_at DESC, id DESC LIMIT 12"
    ).bind(kidId).all();
    let history = (hist.results || []).reverse()
      .map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
    // user/assistant 교대 보장: 첫 메시지는 user여야 함
    while (history.length && history[0].role !== "user") history.shift();

    // 개선된 RAG: 사용자 메시지를 query로 전달 → 관련 지식만
    const kb = await getKbContext(env, kid, message);
    const profile = { label: kid.label, school: kid.school, grade: kid.grade, track: kid.track };
    const system = (await getPrompt(env, "chat", SYSTEM_FALLBACK)) +
      `\n\n[아이 프로필]\n${JSON.stringify(profile)}` +
      (kid.profile ? `\n[추가정보]\n${kid.profile}` : "") +
      (kb ? `\n\n[참고 지식]\n${kb}` : "");

    const messages = [...history, { role: "user", content: message }];
    const answer = await askClaude(env, { model: MODELS.chat, system, messages, max_tokens: 1500 });

    // 저장 — created_at을 ms로 명시(순서 꼬임 방지: user < assistant)
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO chats (id,kid_id,role,content,created_at) VALUES (?,?,?,?,?)")
        .bind("c_" + now + "_u", kidId, "user", message, now),
      env.DB.prepare("INSERT INTO chats (id,kid_id,role,content,created_at) VALUES (?,?,?,?,?)")
        .bind("c_" + now + "_a", kidId, "assistant", answer, now + 1)
    ]);

    return json({ answer });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
