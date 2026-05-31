# 대치파파 — 백엔드 (Cloudflare Pages + Functions + D1 + Claude + 토스)

진짜 작동하는 백엔드 코드입니다. **당신의 키/계정을 꽂고 배포하면 작동**합니다.

## 폴더 구조
```
daechipapa/
├─ wrangler.toml          Cloudflare 설정 (D1 바인딩)
├─ schema.sql             D1 테이블 정의
├─ lib/claude.js          Claude 호출 + RAG 조회 헬퍼
├─ functions/api/
│   ├─ chat.js            POST /api/chat   (아이별 대화, Sonnet)
│   ├─ report.js          POST /api/report (마일스톤/스탠다드, Opus, 자동발행)
│   └─ pay/confirm.js     POST /api/pay/confirm (토스 승인)
└─ public/                정적 프론트(여기에 index.html 등 배치)
    ├─ manifest.json
    ├─ sw.js
    └─ icons/             오렌지 앱 아이콘 (180/192/512)
```

## 배포 (당신이 할 일)

### 0. 사전 준비 — 오직 당신만 가능
- **Anthropic API 키**: console.anthropic.com 에서 발급 (결제 등록)
- **토스 키**: 사업자등록 → 토스페이먼츠 가맹 심사 → 시크릿 키 발급
- **Cloudflare 계정** + Node 18+ 설치
- (법) 사업자등록 · 통신판매업 신고

### 1. 설치 & 로그인
```bash
npm i -g wrangler
wrangler login
```

### 2. D1 만들고 스키마 적용
```bash
wrangler d1 create daechipapa-db
# 출력된 database_id 를 wrangler.toml 에 붙여넣기
wrangler d1 execute daechipapa-db --remote --file=./schema.sql
```

### 3. 시크릿 등록 (코드에 키를 넣지 마세요)
```bash
wrangler pages secret put ANTHROPIC_API_KEY
wrangler pages secret put TOSS_SECRET_KEY
```

### 4. 배포
```bash
wrangler pages deploy public
```
→ `https://daechipapa.pages.dev` 에 뜨고, `/api/*` 가 작동합니다. 이후 도메인 연결.

### 5. 동작 확인
```bash
curl -X POST https://<배포주소>/api/chat \
  -H "content-type: application/json" \
  -d '{"kidId":"테스트아이id","message":"안녕하세요"}'
```

## 아직 남은 진짜 작업 (정직하게)
1. **인증** — 지금은 인증 레이어가 비어 있습니다. 유저: 휴대폰 OTP/이메일 매직링크(예: 관리형 Auth) 연동 필요. Studio/Admin: **Cloudflare Access** 로 잠그기(코드 없이).
2. **지식 데이터(KB) 큐레이션** — `rules`/`schools`/`universities`/`programs` 가 비면 AI가 근거 없이 답합니다. Studio에서 채우고 `status='live'` 로 반영해야 품질이 납니다. **이게 제품의 핵심 노동.**
3. **프론트 연결** — 프로토타입(`daechipapa_app.html`)의 stub(`askClaude`/`generateReport`/`payWithToss`)을 위 `/api/*` 로 교체.
4. **결제 플로우** — 결제 시작 시 `payments` 에 주문(orderId·amount·product) 먼저 INSERT → 토스 결제위젯 → successUrl 에서 `/api/pay/confirm` 호출.
5. **Studio/Admin API** — KB CRUD·리포트 모니터 등(같은 D1 위에 추가).

## 모델
`lib/claude.js` 의 `MODELS` — 대화=Sonnet, 리포트=Opus, 분류=Haiku.
문자열은 docs.claude.com 에서 최신 확인 후 갱신하세요.
