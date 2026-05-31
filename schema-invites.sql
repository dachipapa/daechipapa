-- 마케팅: 초대코드 테이블 (소프트런치 희소성·추천 추적)
-- 적용: wrangler d1 execute daechipapa-db --remote --file=/Users/yoon/Downloads/daechipapa-backend/schema-invites.sql
CREATE TABLE IF NOT EXISTS invites (
  code        TEXT PRIMARY KEY,
  source      TEXT,                         -- 발급처 (예: 대치맘카페, 인스타)
  max_uses    INTEGER DEFAULT 0,            -- 0 = 무제한
  used        INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'active',        -- active / disabled
  created_at  INTEGER DEFAULT (unixepoch())
);
