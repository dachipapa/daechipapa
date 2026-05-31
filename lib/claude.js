export const MODELS = {
  chat:   "claude-sonnet-4-6",
  report: "claude-opus-4-8",
  cheap:  "claude-haiku-4-5-20251001"
};

// ── 위기 신호 감지 프로토콜 (모든 대화에 적용) ──
const CRISIS_PROTOCOL = `
[위기 신호 감지 프로토콜 — 최우선]
사용자 메시지에서 아래 신호가 감지되면 입시 분석을 즉시 중단하고 아래 절차를 따른다:
위기 신호: "자살", "죽고싶", "사라지고싶", "극단적 선택", "살기싫", "못살겠", "너무힘들어", "포기하고싶", "다 끝내고싶", "죽는게 낫겠", "없어지고싶"

감지 시 응답 방식:
1. 입시 이야기는 잠깐 멈추고, 그 감정 먼저 따뜻하게 인정한다.
2. 전문가의 도움을 권유하고 아래 번호를 반드시 안내한다:
   - 자살예방상담전화: ☎ 1393 (24시간, 무료)
   - 청소년상담전화: ☎ 1388 (24시간, 무료)
   - 정신건강위기상담: ☎ 1577-0199 (24시간)
3. "혼자 감당하지 않아도 돼", "지금 많이 지쳐있구나"처럼 공감을 먼저 전한다.
4. 절대 "강해져야 해", "입시가 다가 아니야" 같은 가벼운 위로로 끝내지 않는다.
5. 사용자가 괜찮다고 해도 한 번 더 도움받기를 권한다.`;

// ── Claude API 호출 ──
export async function askClaude(env, { model, system, messages, max_tokens = 2000 }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({ model, max_tokens, system: CRISIS_PROTOCOL + "\n\n" + system, messages })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("Claude API error " + res.status + ": " + t);
  }
  const data = await res.json();
  return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
}

// ── RAG: live KB 조회 ──
export async function getKbContext(env, kid) {
  const out = [];
  const rules = await env.DB.prepare("SELECT content FROM rules WHERE status='live' LIMIT 40").all();
  if (rules.results?.length) {
    out.push("## 해석 규칙(평가자 관점)\n" + rules.results.map(r => "- " + r.content).join("\n"));
  }
  if (kid?.school) {
    const sch = await env.DB.prepare("SELECT name, data FROM schools WHERE name = ? LIMIT 1").bind(kid.school).first();
    if (sch) out.push(`## 학교 데이터: ${sch.name}\n${sch.data}`);
  }
  const progs = await env.DB.prepare(
    "SELECT p.name, p.admission, u.name AS uni FROM programs p JOIN universities u ON u.id = p.university_id LIMIT 30"
  ).all();
  if (progs.results?.length) {
    out.push("## 대학·학과 요강/입결\n" + progs.results.map(p => `- ${p.uni} ${p.name}: ${p.admission}`).join("\n"));
  }
  return out.join("\n\n");
}

export async function getPrompt(env, kind, fallback) {
  const row = await env.DB.prepare(
    "SELECT content FROM prompts WHERE kind = ? AND status='live' ORDER BY version DESC LIMIT 1"
  ).bind(kind).first();
  return row?.content || fallback;
}

export const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status, headers: { "content-type": "application/json; charset=utf-8" }
  });
