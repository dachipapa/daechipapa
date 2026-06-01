-- [1회용] 기존 쪼개진 계정 통합 — 윤태선(네이버) 계정으로 합침.
-- 반드시 schema-link.sql 먼저 실행한 뒤 돌릴 것.
-- 윤나리(현재 p_kakao)를 네이버 계정으로 이관
UPDATE kids SET parent_id='p_naver_T7r40tpmrH3lKewIklopHa1V5yvYIxKF_T7FauQ1b4g'
 WHERE parent_id='p_kakao_4924635540';
-- 카카오·네이버 로그인 둘 다 네이버 계정에 연결 등록
INSERT OR REPLACE INTO auth_identities (provider,provider_uid,parent_id) VALUES
 ('naver','T7r40tpmrH3lKewIklopHa1V5yvYIxKF_T7FauQ1b4g','p_naver_T7r40tpmrH3lKewIklopHa1V5yvYIxKF_T7FauQ1b4g'),
 ('kakao','4924635540','p_naver_T7r40tpmrH3lKewIklopHa1V5yvYIxKF_T7FauQ1b4g');
-- 비워진 카카오 계정 삭제
DELETE FROM parents WHERE id='p_kakao_4924635540';
