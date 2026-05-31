-- 대치파파 D1 스키마
-- 적용:  wrangler d1 execute daechipapa-db --remote --file=./schema.sql

PRAGMA foreign_keys = ON;

-- 부모 계정
CREATE TABLE IF NOT EXISTS parents (
  id           TEXT PRIMARY KEY,
  phone        TEXT UNIQUE,
  nickname     TEXT,
  referrer_id  TEXT,
  source       TEXT,                       -- 추천/카페/인스타 등
  status       TEXT DEFAULT 'active',
  created_at   INTEGER DEFAULT (unixepoch())
);

-- 아이 프로필 (부모당 최대 3 — 앱 로직에서 제한)
CREATE TABLE IF NOT EXISTS kids (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  label       TEXT,                        -- 이름/별명(실명 강제 X)
  school      TEXT,
  grade       TEXT,
  cohort      TEXT,                         -- 졸업 코호트(예: 2028)
  track       TEXT,                         -- 인문/자연/예체능
  profile     TEXT,                         -- JSON: 내신/모평/활동/목표 등
  created_at  INTEGER DEFAULT (unixepoch())
);

-- 대화(아이별 스레드)
CREATE TABLE IF NOT EXISTS chats (
  id          TEXT PRIMARY KEY,
  kid_id      TEXT NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,                -- user / assistant
  content     TEXT NOT NULL,
  created_at  INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_chats_kid ON chats(kid_id, created_at);

-- 우리 아이 매니저(학원 일정)
CREATE TABLE IF NOT EXISTS schedules (
  id          TEXT PRIMARY KEY,
  kid_id      TEXT NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  subject     TEXT, academy TEXT, teacher TEXT,
  days        TEXT,                         -- JSON 배열 ["화","목"]
  start_hour  INTEGER, end_hour INTEGER,
  created_at  INTEGER DEFAULT (unixepoch())
);

-- 리포트(자동 발행)
CREATE TABLE IF NOT EXISTS reports (
  id          TEXT PRIMARY KEY,
  kid_id      TEXT NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                -- milestone / standard_* 
  content     TEXT,                         -- 생성된 리포트(JSON/MD)
  status      TEXT DEFAULT 'published',     -- published / flagged / refunded
  confidence  REAL,                         -- 저신뢰 자동 플래그용
  kb_refs     TEXT,                         -- 근거 KB 항목 ids(JSON)
  created_at  INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_reports_kid ON reports(kid_id, created_at);

-- 크레딧 원장(부모 단위 공유 지갑)
CREATE TABLE IF NOT EXISTS credits (
  id          TEXT PRIMARY KEY,
  parent_id   TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  delta       INTEGER NOT NULL,             -- + 충전/보너스, - 사용
  reason      TEXT,
  created_at  INTEGER DEFAULT (unixepoch())
);

-- 결제
CREATE TABLE IF NOT EXISTS payments (
  id           TEXT PRIMARY KEY,            -- orderId
  parent_id    TEXT REFERENCES parents(id),
  amount       INTEGER NOT NULL,
  product      TEXT,                        -- standard / milestone / credit / manager_sub
  payment_key  TEXT,
  status       TEXT DEFAULT 'pending',      -- pending / paid / failed / refunded
  created_at   INTEGER DEFAULT (unixepoch())
);

-- ===== 지식(KB) — Studio가 채움. 유저 RAG는 status='live'만 사용 =====
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY, name TEXT, region TEXT, type TEXT,
  data TEXT,                                -- JSON: 성취도/과목편성/진학현황
  source TEXT, year INTEGER, updated_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS universities (
  id TEXT PRIMARY KEY, name TEXT, data TEXT, source TEXT,
  year INTEGER, updated_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS programs (
  id TEXT PRIMARY KEY, university_id TEXT, name TEXT,
  admission TEXT,                           -- JSON: 전형/수능최저/반영비율/입결
  source TEXT, year INTEGER
);
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY, category TEXT, content TEXT, tags TEXT,
  source_note_id TEXT, status TEXT DEFAULT 'draft', version INTEGER DEFAULT 1,
  updated_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY, kind TEXT, version INTEGER, content TEXT,
  status TEXT DEFAULT 'draft', updated_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS raw_notes (
  id TEXT PRIMARY KEY, title TEXT, body TEXT, source TEXT, kind TEXT,
  status TEXT DEFAULT 'inbox', created_at INTEGER DEFAULT (unixepoch())
);
