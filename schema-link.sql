-- 계정 연결(account linking). 최초 1회 원격 실행.
-- 한 부모(parents)가 카카오/네이버/구글 여러 로그인을 가질 수 있게 한다.
CREATE TABLE IF NOT EXISTS auth_identities (
  provider     TEXT NOT NULL,
  provider_uid TEXT NOT NULL,
  parent_id    TEXT NOT NULL,
  created_at   INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (provider, provider_uid)
);
CREATE INDEX IF NOT EXISTS idx_identities_parent ON auth_identities(parent_id);

-- 같은 기기 브릿지: 기기 → 마지막 로그인 계정 (카카오처럼 이메일·휴대폰 없는 경우 연결)
CREATE TABLE IF NOT EXISTS device_links (
  device_id  TEXT PRIMARY KEY,
  parent_id  TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);
