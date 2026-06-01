-- 입시 학년도(=입학연도, 공식) 기준으로 cohort 교정. DB 현재연도 기준 자동.
-- 예: 2026년 기준 고2 → 2028학년도. (이미 잘못 들어간 수능연도 값도 덮어씀)
UPDATE kids SET cohort=CAST(strftime('%Y','now') AS INTEGER)+4 WHERE grade='중3';
UPDATE kids SET cohort=CAST(strftime('%Y','now') AS INTEGER)+3 WHERE grade='고1';
UPDATE kids SET cohort=CAST(strftime('%Y','now') AS INTEGER)+2 WHERE grade='고2';
UPDATE kids SET cohort=CAST(strftime('%Y','now') AS INTEGER)+1 WHERE grade LIKE '고3%';
