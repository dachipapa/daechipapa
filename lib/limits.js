// rate limit + 결제 권한(entitlement) — D1 기반
import { json } from "./claude.js";

// 슬라이딩 윈도우 rate limit
// 예: checkRateLimit(env, "chat:"+kidId, 30, 3600)  → 시간당 30회
export async function checkRateLimit(env, key, max, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await env.DB.prepare(
      "SELECT count, window_start FROM rate_limits WHERE key=?"
    ).bind(key).first();
    if (!row || now - row.window_start >= windowSec) {
      await env.DB.prepare(
        "INSERT OR REPLACE INTO rate_limits (key,count,window_start) VALUES (?,1,?)"
      ).bind(key, now).run();
      return { ok: true, remaining: max - 1 };
    }
    if (row.count >= max) {
      return { ok: false, remaining: 0, retryAfter: windowSec - (now - row.window_start) };
    }
    await env.DB.prepare("UPDATE rate_limits SET count=count+1 WHERE key=?").bind(key).run();
    return { ok: true, remaining: max - row.count - 1 };
  } catch {
    return { ok: true, remaining: max }; // 테이블 없을 때 막지 않음(개발 안전)
  }
}

export function tooMany(retryAfter) {
  return json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.", retryAfter }, 429);
}

// 결제 권한 확인: 해당 부모가 해당 리포트 종류를 결제했는지(또는 크레딧)
// 골격 — 토스 연동 후 실제 소비/차감 로직 강화 예정
export async function hasReportEntitlement(env, parentId, kind) {
  if (!parentId) return false;
  // 마일스톤/스탠다드 결제 기록(미사용) 또는 구독 등
  const paid = await env.DB.prepare(
    "SELECT id FROM payments WHERE parent_id=? AND status='paid' AND (product=? OR product='all') LIMIT 1"
  ).bind(parentId, kind).first();
  return !!paid;
}
