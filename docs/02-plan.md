# KYA (Know Your Agent) — 해커톤 계획 (초안, 2026-09-19)

Daytona HackSprint 서울 참가용. 규정과 심사 기준은 `00-hackathon.md`, Daytona SDK 사실은 `01-daytona-sdk-facts.md` 참고.

## 한 줄 요약

> 사람이 에이전트에게 권한을 위임하면, 에이전트는 격리된 샌드박스 안에서만 그 권한을 행사할 수 있고, 가맹점은 요청마다 "누가, 누구를 대신해, 어떤 범위로" 왔는지 검증한다.

## 1. 확정된 결정

| # | 항목 | 결정 | 근거 |
|---|---|---|---|
| D1 | KYA 범위 | 위임 관계 확인 + 거래 시점 행위 검증 (에이전트 자체 신원 확인 단독은 제외) | 결제 시나리오와 직결, 데모 임팩트 |
| D2 | 목표 | 수상 | 심사 기준 4개 전부 겨냥 |
| D3 | 팀 | 2명 (fullstack 1, devops 1) | |
| D4 | 코드 재사용 | 기존 코드(x402, customer-due-diligence 등) 사용 안 함. **코드는 당일에만 작성** | 사전 준비는 설계 문서, 시나리오, 발표 대본까지만 |
| D5 | 에이전트 | 실제 LLM 기반 (스크립트 흉내 아님) | 거절 장면의 설득력 |
| D6 | Daytona 역할 | **샌드박스 = 에이전트의 몸.** 에이전트 하나가 샌드박스 하나에서 실행되고, 생성 시점에 위임 자격 증명을 주입 | 스폰서 통합이 스토리의 핵심이 되도록 |
| D7 | 자격 증명 | **DID 기반** (키워드 가치). 구현 수준은 미정 (Q1 참고, `did:web` + JWT 권장) | |
| D8 | 데모 시나리오 | **구매 대행**: 사장님이 "5만 원 이하, 사무용품만" 위임 → 3만 원 주문 승인 → 8만 원 주문 거절(한도) → 전자기기 주문 거절(카테고리) | 돈이 걸린 문제라 즉시 이해됨 |
| D9 | 스폰서 | Daytona 필수. DNSimple은 선택(당일 필수 경로에 넣지 않음). Nosana 미사용 | |
| D10 | 스택 | TypeScript 단일 스택: Next.js + `@daytona/sdk` + `@anthropic-ai/sdk` | 두 사람이 코드를 바로 이어받도록 |

## 2. 아직 열린 결정 (추천안 포함)

답이 오면 위 표로 옮긴다.

| # | 질문 | 추천 |
|---|---|---|
| Q1 | DID 구현 수준 | `did:web` + JWT. DID 문서는 `/.well-known/did.json` 하나. 클레임 이름은 VC 어휘(issuer, credentialSubject, expirationDate). 라이브러리는 `jose`만 |
| Q2 | DID를 갖는 주체 | 사장님 + 에이전트. 에이전트 DID는 샌드박스 ID 포함 (`did:web:<host>:agents:<sandbox-id>`) |
| Q3 | 행위 검증 방식 | 소지 증명(PoP): 에이전트 키를 샌드박스 안에서 생성, 요청마다 본문 해시 + nonce 서명. 시간 부족 시 bearer로 하향 |
| Q4 | 역할 분담 | A = 발급·검증 쪽(Next.js UI, 발급 API, DID 문서, 가맹점 mock + 게이트웨이). B = 에이전트 쪽(샌드박스 생성, 에이전트 러너, 키 생성·서명, 터널). **누가 A/B인지 미정** |
| Q5 | LLM 설정 | `claude-opus-5`, `output_config.effort: "low"`, Tool Runner(`betaZodTool`), 도구 2개(`search_products`, `place_order`). **API 키 보유 여부 미확인** |
| Q6 | 데모 화면 | 한 페이지 세 칸: 위임 발급 / 에이전트 실행 로그 / 게이트웨이 판정. 1초 폴링 |
| Q7 | 실패 대비 | 로컬 실행 플래그, 시나리오 고정 프롬프트 + 낮은 max_tokens, 15:40 리허설 후 코드 동결 |
| Q8 | 발표 | 문제 30초 / 데모 2분 / 확장 30초. 한 명이 말하고 한 명이 조작. **발표자 미정** |
| Q9 | 해커톤 날짜 | **미확인** (사전 준비 일정에 필요) |
| Q10 | 게이트웨이·DID 문서 노출 | 노트북 Next.js + `cloudflared` 임시 터널을 기본으로, DNSimple 도메인을 CNAME으로 붙여 `did:web:kya.<도메인>` 만들기. **도메인 보유 여부 미확인** |

## 3. 아키텍처 초안

```
[사장님 브라우저]
   │ 1. 한도·카테고리 입력 → 서명 버튼
   ▼
[Next.js 앱 (노트북, 터널로 HTTPS 노출)]
   ├─ /.well-known/did.json        사장님 DID 문서 (공개키)
   ├─ /agents/<sandbox-id>/did.json 에이전트 DID 문서 (샌드박스가 등록)
   ├─ POST /delegations            위임 JWT 발급 (사장님 키로 서명)
   ├─ POST /sandboxes              Daytona 샌드박스 생성 + envVars 주입
   ├─ GET  /products, POST /orders 가맹점 mock
   │     └─ 게이트웨이 미들웨어: 위임 JWT 검증 → 에이전트 서명 검증 → 범위 검사
   └─ GET  /log                    UI 폴링용 이벤트 로그
   │
   │ 2. daytona.create({ envVars: { DELEGATION_JWT, GATEWAY_URL } })
   ▼
[Daytona 샌드박스 = 에이전트]
   ├─ 시작 시 키 쌍 생성 (개인키는 샌드박스 밖으로 나가지 않음)
   ├─ 공개키를 /agents/<sandbox-id>/did.json 으로 등록
   ├─ Claude Tool Runner: search_products → place_order
   └─ place_order 마다 { body hash, nonce } 를 에이전트 키로 서명 + 위임 JWT 동봉
```

두 사람이 만나는 계약은 두 가지뿐이다. 당일 시작 전에 이 둘을 문서로 고정한다.

1. **위임 JWT 클레임** (초안)
   ```json
   {
     "iss": "did:web:kya.example.com",
     "sub": "did:web:kya.example.com:agents:<sandbox-id>",
     "vc": {
       "type": ["VerifiableCredential", "AgentDelegation"],
       "credentialSubject": {
         "scope": { "maxAmountKRW": 50000, "categories": ["office-supplies"] }
       }
     },
     "iat": 0, "exp": 0, "jti": "..."
   }
   ```
2. **주문 요청 형식** (초안)
   - 헤더: `Authorization: Delegation <위임 JWT>`, `X-Agent-Proof: <에이전트 서명 JWT: { bodyHash, nonce, iat }>`
   - 본문: `{ "productId": "...", "amountKRW": 30000, "category": "office-supplies" }`
   - 응답: `{ "decision": "approved" | "denied", "reason": "..." }` 와 로그 이벤트 기록

## 4. 당일 타임라인 초안 (14:00–16:00)

| 시각 | A (발급·검증) | B (에이전트) |
|---|---|---|
| 14:00–14:15 | 레포 생성, Next.js 골격, `jose` 설치, 계약 문서 재확인 | Daytona 키 확인, `daytona.create` 로 빈 샌드박스 1회 생성·삭제 확인, 터널 실행 |
| 14:15–14:45 | DID 문서 라우트, 위임 발급 API + 화면 | 에이전트 러너 뼈대: 키 생성, Claude Tool Runner, 도구 2개 (게이트웨이는 아직 mock 응답) |
| 14:45–15:15 | 가맹점 mock + 게이트웨이 검증(JWT, 서명, 범위) + 로그 API | 샌드박스 생성 스크립트: 파일 업로드 → envVars 주입 → executeCommand 로 러너 실행 |
| 15:15–15:35 | 세 칸 화면 + 폴링 | 실제 게이트웨이와 연결, 승인 1·거절 2 시나리오 확인 |
| 15:35–15:40 | 로컬 실행 플래그 (실패 대비) | DNSimple CNAME (여유 있을 때만) |
| 15:40–15:50 | **리허설 1회, 이후 코드 동결** | |
| 15:50–16:00 | 발표 대본 마지막 점검, 화면 배치 | 샌드박스 미리 하나 띄워 두기(시작 지연 방지) |

## 5. 사전 준비 목록 (코드 제외)

- [ ] Daytona 계정과 API 키 (`DAYTONA_API_KEY`) 발급, 대시보드에서 샌드박스 생성 1회 눌러보기
- [ ] Anthropic API 키 확인 (없으면 발급)
- [ ] `cloudflared` 설치 확인
- [ ] (선택) DNSimple 계정 + 도메인 확보, CNAME 추가 절차 확인
- [ ] 위임 JWT 클레임과 주문 요청 형식 확정 (위 3절)
- [ ] 발표 대본 3분 분량 작성, 발표자 결정
- [ ] 시스템 프롬프트 초안: 시나리오 순서(3만 원 → 8만 원 → 전자기기) 고정
- [ ] Daytona 워크숍(13:30) 에서 확인할 것: 패키지 이름 `@daytona/sdk`, preview link 인증 방식, 크레딧 한도

## 6. 발표 뼈대 (3분)

1. **문제 (30초)**: 에이전트가 결제를 대신하는 시대가 왔지만, 가맹점은 요청을 보낸 에이전트가 누구를 대신하는지, 어떤 권한을 받았는지 알 수 없다. KYC는 있는데 KYA는 없다.
2. **데모 (2분)**: 사장님이 위임 발급 → 샌드박스 생성 → 에이전트가 3만 원 주문 승인 → 8만 원 시도, 한도 초과 거절 → 전자기기 시도, 카테고리 밖 거절. 판정 카드마다 "누가, 누구를 대신해, 왜"가 보인다.
3. **확장 (30초)**: 재위임(Biscuit 식 권한 감쇠), DNS 앵커링, 실제 에이전트 결제 프로토콜(x402, AP2 등) 연결.
