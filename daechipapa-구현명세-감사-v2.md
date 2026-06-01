# 대치파파 — 시스템 구현 명세 & 전수 감사 (v2, 실제 레포 검증판)

> 정본. v1과 달리 **현재 git 레포(HEAD `cdd1526`+) 전 파일을 끝까지 읽고**, 라이브 D1 데이터로 교차검증함.
> 검증 등급: ✅ 코드/데이터로 확인 · ⚠️ 동작하나 개선/주의 · 🔴 버그(수정상태 표기).
> 갱신: 2026-06-01 (세션3, 전수 감사).

---

## 0. 시스템 지도
- 랜딩 `daechipapa.com`=`index.html` / 유저앱 `app.daechipapa.com`=`app.html` / 인터널 `internal.daechipapa.com`=`internal.html`(Cloudflare Access).
- 라우팅: `_middleware.js`가 `host`의 `app.`/`internal.` 접두로 루트(`/`)를 각 html로 302. `/api/*`·기타경로는 통과. ✅
- 백엔드 28 엔드포인트(Functions) + D1(`DB`). 모델: 대화 sonnet-4-6 / 리포트 opus-4-8 / 분류·추출 haiku.

## 1. 인증·세션·계정 (이번에 대폭 수정) ✅
- localStorage: `deviceId, parentId, activeKidId, authProvider, userType`.
- **계정 모델(신규):** `parents`=계정(PII), `auth_identities(provider,uid→parent_id)`=로그인수단(N개), `device_links(device→parent)`=같은기기 브릿지.
- 소셜 로그인: `start.js`(state에 device·mk·link 서명) → 제공자 → `callback.js`.
- **콜백 계정결정 순서:** ①명시적 link(계정연결) ②기존 identity ③이메일 ④휴대폰 ⑤같은 기기 ⑥신규. 그 후 PII upsert + identity 연결(다른 계정에 있던 아이는 병합) + device_links 기록 + 익명 기기부모(p_dev) 아이 이관/삭제.
- 진입 라우팅(`initSession`): 해시 `#p=`(콜백복귀)면 그 계정으로; 일반 로드면 `PARENT_ID` 있으면 dashboard/onboard. **BUG-2 수정완료**(authProvider 게이트 제거 → 체험 사용자도 새로고침 시 유지). `pageshow`도 동일.
- 계정화면: PII 3행 + **"로그인 연결"**(카카오/네이버/구글, 연결됨/연결하기 버튼) `linkLogin(prov)`.
- **라이브 데이터로 검증:** 윤태선의 네이버·카카오가 한 계정(`p_naver_T7r40…`)으로 통합됨, 윤나리 그 밑. ✅

## 2. 프로필·아이 ✅ / ⚠️
- `saveProfile`→`POST /api/kids`(parentId,label,school,grade,track,cohort). 멀티아이 ≤3. cohort=입시연도(고1=2028…).
- ⚠️ **완성도 불일치(FINDING-A):** 수동폼은 학교를 `school`(원문)만 저장. 그러나 `profileStatus`(intake.js)·리포트는 `school_matched`/`school_type`로 "학교 파악" 판정 → **수동 입력 학교는 미파악으로 잡혀** 리포트 신뢰도↓·"학교정보 더 주세요". (대화 입력은 `matchSchool`이 채워 정상.)
- ⚠️ **검정고시(FINDING-B):** intake 추출 스키마는 `school_type:검정고시` 지원하나 **수동폼엔 옵션 없음.** 화면 용어 "코호트" 등 정돈 미반영(협의분).

## 3. 대화 ✅
- `askClaude`→`POST /api/chat`{kidId,message}. chat.js: 프로필 추출(haiku)→학교매칭→RAG(`getKbContext`)→sonnet→`chats` 저장(최근12 히스토리). **아이 단위 기억 정상.**
- ✅ **안전장치:** `claude.js`가 모든 시스템프롬프트 앞에 **위기신호 프로토콜**(자살예방 1393·청소년 1388·정신건강 1577-0199) 선주입.

## 4. 리포트 ✅(로직) / ⚠️(게이팅)
- `generate(kind)`→`POST /api/report`. 종류: milestone(8000토큰)·standard_map/dx/school(4000).
- 신뢰도=데이터 완성도(0.15~0.85), <0.45 또는 JSON파싱실패 시 `flagged`(검수대기). reports 테이블 저장. 라이브러리/대시 표시.
- ⚠️ **결제 게이팅(FINDING-C):** `hasReportEntitlement`는 `payments`의 `status='paid'` 행 필요 → 토스 미연동이라 결제행 0 → **일반 사용자 리포트 전부 402(잠김).** 어드민 시크릿 헤더만 우회 가능. (토스 연동 전까진 의도된 동작.)

## 5. 매니저(일정) ✅
- 클라 `CLS`+파서. 문장 입력→후보(sched:false), "올리기"→일정(sched:true), 충돌검사는 올릴 때만.
- 영속: `/api/schedules` GET/POST/PUT(scheduled)/DELETE. 스키마 컬럼(subject/academy/teacher/days/start_hour/end_hour/scheduled) **전부 일치 확인.** 렌더테스트 통과.

## 6. 결제 ⚠️(미완)
- `pay/confirm.js`: 토스 승인(주문금액 대조→토스 confirm→paid). **단 주문(payments 행) 생성 엔드포인트가 없음** → confirm은 사전 주문행 전제. 또 confirm은 `product='credit'`만 크레딧 적립 처리. 토스 키 미등록. → **구매 시작 흐름 전체 미구현**(토스 연동 시: 주문생성 API + 프런트 위젯 + product→권한).

## 7. 인터널 (Studio+Admin) ✅ / 🔴1건
- 인증: 전역 `ADMIN_KEY`→`x-admin-secret`. ⚠️ `requireAdmin`은 `ADMIN_SECRET` 미설정 시 통과(fail-open) — production 등록 확인 필요.
- **죽은 버튼 0개**(onclick 전부 정의됨), 링크 정상.
- Studio: notes(원자료)→analyze(haiku, 사실/규칙 분리 초안)→kb(CRUD)→publish(draft→live)→test(미리보기). data-status·uni-search·programs·ipgyeol-import·data/sync(학교알리미).
- 🔴 **FINDING-D (수정 패치 제공): `studio/kb.js` 프롬프트 INSERT** 컬럼5·값4 불일치 → 프롬프트 생성/수정 SQL 에러. → `studio-prompt-fix.zip`로 수정(값 placeholder 1개 추가).
- ⚠️ **FINDING-E:** `publish.js`/`kb.js` 허용목록에 `universities`·`programs` 포함되나 두 테이블엔 `status`/`updated_at` 컬럼 없음 → 그걸 publish/status필터 시 에러. (주 워크플로 아님. 허용목록에서 제외 권장.)
- Admin: dashboard(지표)·reports(flag/refund/publish — refund는 토스환불 TODO)·users(PIPA삭제, **계정연결 cascade 추가 완료**)·payments·invites.

## 8. 백엔드 엔드포인트(28) — 검증 contract
공개/유저: chat·report(402)·schools(자동완성)·stats·parent(GET은 logins 포함 반환)·kids(CRUD)·reports·schedules·credits·account(DELETE cascade+identities/device_links)·pay/confirm(orphan).
auth: auth/[provider]/start·callback·config. data: sync·seed-universities.
admin(requireAdmin): dashboard·reports·users·payments·invites. studio(requireAdmin): notes·analyze·kb·publish·test·data-status·uni-search·programs·ipgyeol-import.

## 9. DB 스키마 (검증된 컬럼)
parents(+email/provider/provider_uid/age_range/birth_year/marketing_optin/name) · kids(profile JSON) · chats · schedules(+scheduled) · reports(content/status/confidence/kb_refs) · credits(delta) · payments · schools · universities(updated_at) · programs(university_id/admission, status·updated_at **없음**) · rules(status/updated_at) · prompts(version/status/updated_at) · raw_notes · rate_limits · invites · **auth_identities** · **device_links**.
적재: 고교 2,446 / 대학 227 / 학과 10,319 / 규칙 40.

## 10. 데이터 흐름
원자료→analyze→rules(draft)→publish(live)→**대화·리포트 RAG**(getKbContext: rules점수화 top15 + 학교 LIKE + 질문언급 대학/학과). 입결: sync→schools(자동완성+RAG), ipgyeol-import→programs.admission. 결제→payments/credits→report 402, admin refund→reports.status.

---

## 11. 감사 결과 — 버그/이슈 종합
| # | 내용 | 심각도 | 상태 |
|---|---|---|---|
| BUG-1 | 제공자별 계정 분리(로그인하면 데이터 없음) | 높음 | ✅ **수정·배포**(계정연결+backfill) |
| BUG-2 | 새로고침 시 체험사용자 랜딩 튕김 | 중 | ✅ **수정·배포** |
| 보안 | 탈퇴/삭제가 계정연결 테이블 미정리 | 중(PIPA) | ✅ **수정·배포**(cascade) |
| FINDING-D | studio/kb 프롬프트 INSERT 컬럼/값 불일치 | 중 | 🟢 **패치 제공**(prompt-fix) |
| FINDING-A | 수동 학교가 완성도 미반영→리포트 신뢰도↓ | 중 | 🟡 미수정(프로필 정돈과 함께) |
| FINDING-B | 검정고시·코호트용어 등 수동폼 정돈 | 중 | 🟡 미수정(협의분) |
| FINDING-C | 리포트 402 전면 잠김(토스 전) | 정보 | 🟡 의도됨/토스 대기 |
| FINDING-E | publish/kb 허용목록 universities·programs 컬럼없음 | 낮음 | 🟡 미수정 |
| 보안 | admin status 필터 문자열 보간(주입 패턴, 어드민게이트) | 낮음 | 🟡 권장: 파라미터화 |
| 운영 | requireAdmin fail-open / p_dev 누적 / p_yoon phone에 이메일 | 낮음 | 🟡 점검 |

## 12. 남은 일 / 결정
1. **프로필 정돈 한 묶음**(FINDING-A·B + 이름(별명)+검정고시+학교 커스텀드롭다운+"입시연도"용어). ← 다음 추천.
2. **토스 결제 실연동**(주문생성 API + 위젯 + product→권한 + refund) — 키 받으면.
3. (선택) 하드닝: admin SQL 파라미터화, publish 허용목록 정리, requireAdmin fail-closed.
4. 라이브 브라우저 실클릭 검수(로그인 2제공자/새로고침/매니저/리포트402) — 사용자.
