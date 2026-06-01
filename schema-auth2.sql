-- 부모 실명 컬럼 추가 (phone 컬럼은 기존 parents에 이미 존재). 최초 1회.
ALTER TABLE parents ADD COLUMN name TEXT;
