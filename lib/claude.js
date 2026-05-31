export const MODELS = {
  chat:   "claude-sonnet-4-6",
  report: "claude-opus-4-8",
  cheap:  "claude-haiku-4-5-20251001"
};

const CRISIS_PROTOCOL = `
[위기 신호 감지 프로토콜 — 최우선]
사용자 메시지에서 아래 신호가 감지되면 입시 분석을 즉시 중단하고 절차를 따른다:
위기 신호: "자살","죽고싶","사라지고싶","극단적 선택","살기싫","못살겠","너무힘들어","포기하고싶","다 끝내고싶","죽는게 낫겠","없어지고싶"
감지 시:
1. 입시 이야기는 멈추고 감정을 먼저 따뜻하게 인정한다.
2. 전문 도움을 권하고 번호를 반드시 안내한다:
   - 자살예방상담 ☎ 1393 (24시간)
   - 청소년상담 ☎ 1388 (24시간)
   - 정신건강위기상담 ☎ 1577-0199 (24시간)
3. "혼자 감당하지 않아도 돼"처럼 공감을 먼저.
4. 가벼운 위로로 끝내지 않는다.
5. 괜찮다고 해도 한 번 더 도움받기를 권한다.`;

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

// 학교명 정규화 (대치고 → 대치 로 핵심부 추출, LIKE 매칭용)
function schoolStem(name) {
  return String(name || "").replace(/(고등학교|중학교|여자고등학교|여고|고|중)$/u, "").trim();
}

// ── 개선된 RAG: 관련성 기반 검색 (query + 아이 맥락) ──
export async function getKbContext(env, kid, query = "") {
  const out = [];
  const q = String(query || "").toLowerCase();
  const qWords = q.split(/\s+/).filter(w => w.length > 1);
  const kidKeywords = [kid?.track, kid?.grade, kid?.cohort, schoolStem(kid?.school)]
    .filter(Boolean).map(s => String(s).toLowerCase());

  // 1) 규칙: 관련성 점수화 → 상위 15개만
  const rulesRes = await env.DB.prepare(
    "SELECT category, content, tags FROM rules WHERE status='live'"
  ).all();
  const rules = rulesRes.results || [];
  if (rules.length) {
    const scored = rules.map(r => {
      const text = (r.content + " " + (r.tags || "")).toLowerCase();
      let score = 0;
      for (const kw of kidKeywords) if (kw && text.includes(kw)) score += 2;
      for (const w of qWords) if (text.includes(w)) score += 1;
      if (r.category === "서비스범위" || r.category === "제도변화") score += 1; // 항상 약간 관련
      return { content: r.content, score };
    }).sort((a, b) => b.score - a.score);
    const top = scored.filter(r => r.score > 0).slice(0, 15);
    const picked = top.length ? top : scored.slice(0, 8); // 매칭 없으면 일반 규칙 일부
    out.push("## 해석 규칙(평가자 관점)\n" + picked.map(r => "- " + r.content).join("\n"));
  }

  // 2) 학교: LIKE 매칭 (대치고 → 대치고등학교)
  if (kid?.school) {
    const stem = schoolStem(kid.school);
    const sch = await env.DB.prepare(
      "SELECT name, data FROM schools WHERE name LIKE ? LIMIT 1"
    ).bind("%" + stem + "%").first();
    if (sch) out.push(`## 학교 데이터: ${sch.name}\n${sch.data}`);
  }

  // 3) 대학/학과: 질문에 언급된 대학만 (랜덤 덤프 금지)
  const unisRes = await env.DB.prepare("SELECT id, name, data FROM universities").all();
  const unis = unisRes.results || [];
  const mentioned = unis.filter(u => {
    const short = u.name.replace(/대학교|대$/u, "").toLowerCase();
    return short.length > 1 && (q.includes(short) || q.includes(u.name.toLowerCase()));
  }).slice(0, 5);
  if (mentioned.length) {
    out.push("## 관련 대학\n" + mentioned.map(u => `- ${u.name}: ${u.data}`).join("\n"));
    for (const u of mentioned.slice(0, 3)) {
      const progs = await env.DB.prepare(
        "SELECT name, admission FROM programs WHERE university_id = ? LIMIT 10"
      ).bind(u.id).all();
      if (progs.results?.length) {
        out.push(`### ${u.name} 학과\n` + progs.results.map(p => `- ${p.name}: ${p.admission}`).join("\n"));
      }
    }
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
