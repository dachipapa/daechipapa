-- 소셜 로그인용 parents 컬럼 추가 (D1/SQLite). 최초 1회만 실행.
-- 실행: wrangler d1 execute <DB> --file=schema-auth.sql --remote
ALTER TABLE parents ADD COLUMN email TEXT;
ALTER TABLE parents ADD COLUMN provider TEXT;
ALTER TABLE parents ADD COLUMN provider_uid TEXT;
ALTER TABLE parents ADD COLUMN age_range TEXT;
ALTER TABLE parents ADD COLUMN birth_year TEXT;
ALTER TABLE parents ADD COLUMN marketing_optin INTEGER DEFAULT 0;
