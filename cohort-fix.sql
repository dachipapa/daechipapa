-- 잘못 저장된 cohort(입시연도)를 학년 기준 연도로 교정. 4자리 연도가 아닌 행만 고침(안전).
UPDATE kids SET cohort='2029' WHERE grade='중3'      AND cohort NOT GLOB '[0-9][0-9][0-9][0-9]';
UPDATE kids SET cohort='2028' WHERE grade='고1'      AND cohort NOT GLOB '[0-9][0-9][0-9][0-9]';
UPDATE kids SET cohort='2027' WHERE grade='고2'      AND cohort NOT GLOB '[0-9][0-9][0-9][0-9]';
UPDATE kids SET cohort='2026' WHERE grade LIKE '고3%' AND cohort NOT GLOB '[0-9][0-9][0-9][0-9]';
