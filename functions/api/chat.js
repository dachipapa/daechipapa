// POST /api/chat   { kidId, message }
// 대화형 인테이크: 메시지에서 프로필 추출·저장 + 관련 지식(RAG) + 빈 정보 자연스럽게 수집
import { askClaude, getKbContext, getPrompt, MODELS, json } from "../../lib/claude.js";
import { checkRateLimit, tooMany } from "../../lib/limits.js";
import { extractProfile, intakeGuidance } from "../../lib/intake.js";

const SYSTEM_FALLBACK = `당신은 "대치파파"입니다. 대입 수시를 분석하는 도우미입니다.
원칙: 합격을 보장하거나 예측하지 않습니다. "참고용 분석"임을 전제합니다.
자소서·면접·세특 등의 "작성 지도"는 하지 않습니다(분석만).
제공된 지식과 학생 정보에 근거해 따뜻하고 담백하게 답하세요. 근거 없는 단정은 피합니다.`;

export async function onRequestPost({ request, env }) {
  try {
    const { kidId, message } = await request.json();
    if (!kidId || !message) return json({ error: "kidId, message 필요" }, 400);
    if (message.length > 2000) return json({ error: "메시지가 너무 깁니다." }, 400);

    const rl = await checkRateLimit(env, "chat:" + kidId, 40, 3600);
    if (!rl.ok) return tooMany(rl.retryAfter);

    const kid = await env.DB.prepare("SELECT * FROM kids WHERE id = ?").bind(kidId).first();
    if (!kid) return json({ error: "아이를 찾을 수 없음" }, 404);

    // 1) 메시지에서 구조화 프로필 추출 → 병합 (대화형 인테이크)
    let profile = {};
    try { profile = kid.profile ? JSON.parse(kid.profile) : {}; } catch { profile = {}; }
    const updated = await extractProfile(env, profile, message);

    // 2) 히스토리 (created_at ms 정렬, user부터 시작 보장)
    const hist = await env.DB.prepare(
      "SELECT role, content FROM chats WHERE kid_id = ? ORDER BY created_at DESC, id DESC LIMIT 12"
    ).bind(kidId).all();
    let history = (hist.results || []).reverse()
      .map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
    while (history.length && history[0].role !== "user") history.shift();

    // 3) RAG + 인테이크 가이드
    const kb = await getKbContext(env, kid, message);
    const base = { label: kid.label, school: kid.school, grade: kid.grade, track: kid.track };
    const system = (await getPrompt(env, "chat", SYSTEM_FALLBACK)) +
      `\n\n[기본 정보]\n${JSON.stringify(base)}` +
      intakeGuidance(updated) +
      (kb ? `\n\n[참고 지식]\n${kb}` : "");

    const messages = [...history, { role: "user", content: message }];
    const answer = await askClaude(env, { model: MODELS.chat, system, messages, max_tokens: 1500 });

    // 4) 저장: 대화 + 갱신된 프로필
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO chats (id,kid_id,role,content,created_at) VALUES (?,?,?,?,?)")
        .bind("c_" + now + "_u", kidId, "user", message, now),
      env.DB.prepare("INSERT INTO chats (id,kid_id,role,content,created_at) VALUES (?,?,?,?,?)")
        .bind("c_" + now + "_a", kidId, "assistant", answer, now + 1),
      env.DB.prepare("UPDATE kids SET profile = ? WHERE id = ?")
        .bind(JSON.stringify(updated), kidId)
    ]);

    return json({ answer, profile: updated });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
