-- rate limit 테이블 추가 (전수검사 후 패치)
-- 적용: wrangler d1 execute daechipapa-db --remote --file=/Users/yoon/Downloads/daechipapa-backend/schema-patch.sql
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT PRIMARY KEY,
  count        INTEGER DEFAULT 0,
  window_start INTEGER
);
