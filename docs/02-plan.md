# KYA (Know Your Agent) — 해커톤 계획 (2026-09-19 14:30 개정)

Daytona HackSprint 서울 참가용. 규정은 `00-hackathon.md`, Daytona SDK는 `01-daytona-sdk-facts.md`, UCP·x402 스펙은 `03-ucp-x402-facts.md`, 두 사람 사이의 계약은 `04-contract.md`, 용어는 `../CONTEXT.md`.

## 한 줄 요약

> 신원 확인을 마친 사람(자연인·사업자)이 에이전트에게 지출 권한을 위임하면, 에이전트는 Daytona 샌드박스 안에서만 그 권한으로 UCP 상점에서 물건을 고르고 x402로 결제하며, KYA Verifier는 돈이 움직이기 직전에 "누가, 누구를 대신해, 얼마까지"를 검사한다.

## 1. 확정된 결정

| # | 항목 | 결정 |
|---|---|---|
| D1 | 제품 | **KYA 플랫폼(Verifier + 발급)**만 제품. Merchant와 Agent는 참조 구현 |
| D2 | 목표 | 수상 |
| D3 | 팀·역할 | A(본인) = KYA 플랫폼 전부 + 샌드박스 생성. B(팀원) = UCP Merchant + Agent 러너 |
| D4 | 코드 | 당일 작성. 기존 `~/workspace/x402`는 참고만(공식 SDK 미사용, mock 체인이라 그대로 못 씀) |
| D5 | Agent | 실제 LLM(Claude Tool Runner). 시나리오는 `SHOPPING_LIST` 환경 변수로 고정 |
| D6 | Daytona | 샌드박스 = Agent의 몸. 지갑 키는 샌드박스 안에서 생성되고 밖으로 나가지 않음. 주소만 보고 |
| D7 | 자격 증명 | Delegation JWT(EdDSA, `jose`). 주체 = Agent 지갑 주소 `did:pkh:eip155:84532:0x…`. 결제 서명이 곧 소지 증명이므로 별도 PoP 없음 |
| D8 | Principal | 신원 확인 스텁(자연인/사업자, 이름, 사업자등록번호 → "확인됨") 뒤 플랫폼이 `did:web:<host>:principals:<id>`와 서명 키를 만들어 보관. **데모는 KYC 화면에서 시작해 KYA로 넘어간다** |
| D9 | Scope | 1회 한도, 누적 한도, 허용 Merchant(payTo 주소), 유효 기간. 카테고리 없음(UCP item에 카테고리 필드가 없음) |
| D10 | 검사 지점 | x402 facilitator 자리. Verifier가 KYA 검사 후 `https://x402.org/facilitator`로 verify/settle을 프록시 |
| D11 | 누적 한도 | settle 성공 시점에 Spend Ledger 가산. 저장은 메모리 + JSON 파일 |
| D12 | 운반 | x402 v2 `extensions.kya`. 402에서 광고, 결제 페이로드에 `info.delegation` 덧붙임 |
| D13 | 네트워크 | Base Sepolia, 테스트넷 USDC. Agent 지갑 충전은 발표자가 Circle faucet으로 직접(ETH 불필요) |
| D14 | UCP | B가 최소 형태(discovery, products, checkout-sessions, complete)만. 결제 핸들러 `com.kya.x402` 하나 |
| D15 | 데모 장면 | A 3 USDC 승인 → B 8 USDC 거절(1회 한도) → C 4 USDC 승인 → C 4 USDC 거절(누적 한도) |
| D16 | 스택 | TypeScript. A: Next.js(화면 + API 라우트) + `jose` + `viem` + `@daytona/sdk`. B: Hono + `@x402/hono` + `@x402/fetch` + `@x402/evm` + `@anthropic-ai/sdk` |
| D17 | 스폰서 | Daytona 필수. DNSimple은 여유 있을 때 `did:web` 호스트에만 |

## 2. 아키텍처

```
[Principal 브라우저]  KYC 스텁 → 확인됨 → 샌드박스 생성 → 주소 확인 → Scope 입력 → Delegation 발급
        │
        ▼
[A: KYA 플랫폼 (Next.js, cloudflared 터널)]
   ├─ /.well-known/did.json                 Principal 공개키
   ├─ POST /principals                      신원 확인 스텁 + DID·키 생성
   ├─ POST /sandboxes                       Daytona 생성 + B 러너 업로드 + envVars 주입 + 실행
   ├─ POST /agents/register                 { sandboxId, address }
   ├─ GET  /agents/:address/delegation      발급 전 404 / 발급 후 JWT
   ├─ POST /delegations                     JWT 발급 (충전은 사람이 Circle faucet으로)
   ├─ POST /agents/:address/events          Agent 로그
   ├─ Verifier: GET /supported, POST /verify, POST /settle   (KYA 검사 → x402.org 프록시)
   └─ GET  /decisions                       판정 카드용
        │ daytona.create({ envVars })
        ▼
[Daytona 샌드박스 = Agent (B 러너)]
   키 생성 → register → delegation 폴링 → 잔액 대기 → Claude Tool Runner(list_products, create_checkout, complete_checkout)
        │ UCP + x402 (PAYMENT-SIGNATURE에 extensions.kya.info.delegation)
        ▼
[B: Merchant (Hono)]  /.well-known/ucp, /products, /checkout-sessions, /checkout-sessions/:id/complete (@x402/hono, facilitator = A의 Verifier)
```

화면(한 페이지 네 칸): 신원 확인·위임 발급 / 샌드박스·Agent 로그 / Verifier 판정 카드 / Spend Ledger 게이지. 1초 폴링.

## 3. 타임라인 (14:30–16:00)

| 시각 | A (KYA 플랫폼) | B (Merchant + Agent) |
|---|---|---|
| 14:30–14:45 | Next.js 골격, `jose`·`viem`·`@daytona/sdk` 설치, 터널, treasury 지갑 자금(faucet) | Hono 골격, `@x402/hono` 미들웨어를 x402.org facilitator로 먼저 붙여 402 왕복 1회 확인 |
| 14:45–15:05 | Principal 스텁 + DID 문서 + Delegation 발급 API + register/폴링 API | Merchant 4개 라우트 + `extensions.kya` 광고. Agent 러너: 키 생성, register, 폴링, `@x402/fetch`에 delegation 덧붙이기 |
| 15:05–15:25 | Verifier 3개 엔드포인트 + 6단계 검사 + Spend Ledger + `/decisions` | Claude Tool Runner 도구 3개. 로컬에서 A의 Verifier로 시나리오 4장면 확인 |
| 15:25–15:40 | 화면 4칸 + 폴링. `POST /sandboxes`로 B 러너 실제 샌드박스에서 실행 | 샌드박스 안에서 러너 동작 확인(터널 URL 접근, 잔액 대기) |
| 15:40–15:45 | `KYA_SETTLE_MODE=mock` 플래그 확인 | 발표 화면 배치 |
| 15:45–15:55 | **리허설 1회, 이후 코드 동결** | |
| 15:55–16:00 | 샌드박스 미리 하나 띄워 두기 | 대본 마지막 점검 |

## 4. 실패 대비

- 테스트넷 정산 실패 → `KYA_SETTLE_MODE=mock` (검사는 실제, 정산만 가짜 tx)
- 샌드박스 안에서 터널 접근 실패 → 러너를 노트북에서 실행하되 화면에는 sandbox id 표시
- Circle faucet 충전 실패 → USDC 20이 든 `.env.treasury` 키를 `AGENT_PRIVATE_KEY`로 주입(D6 하향)
- LLM 지연 → `max_tokens` 낮게, `effort: "low"`, 시나리오는 `SHOPPING_LIST`로 고정

## 5. 발표 뼈대 (3분)

1. **문제 (30초)**: 에이전트가 결제를 대신하는 시대에 가맹점과 결제망은 "이 에이전트가 누구를 대신하고 얼마까지 쓸 수 있는가"를 모른다. KYC는 있는데 KYA는 없다.
2. **데모 (2분)**: KYC 화면에서 사업자 확인 → Daytona 샌드박스 생성, 에이전트가 자기 지갑을 만들어 주소 보고 → 위임 발급과 충전 → UCP 상점에서 A 승인, B 1회 한도 거절, C 승인, C 누적 한도 거절. 판정 카드마다 "누가, 누구를 대신해, 왜"가 보인다.
3. **확장 (30초)**: x402 확장 `kya`를 x402 Foundation identity WG에 제안, AP2 open mandate와 호환, 재위임(권한 감쇠), 실제 KYC 사업자 연동.
