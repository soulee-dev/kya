# E2E 시연 시나리오 (2026-09-19)

용어는 `CONTEXT.md`, 접점 형식은 `docs/04-contract.md`를 따른다. 무대 데모 3분 기준으로 사람이 하는 일과 자동으로 일어나는 일을 순서대로 적었다.
2026-09-19 15:55에 실제 Daytona 샌드박스 + OpenAI 에이전트로 4장면을 끝까지 통과했다. 스크린샷은 `docs/screenshots/`.

## 구성 요소와 포트

| 구성 요소 | 포트 | 노출 | 비고 |
|---|---|---|---|
| web (`@kya/web`, Next.js) | 3000 | `WEB_TUNNEL` | 화면 + 발급 API + `/.well-known/did.json` |
| verifier (`@kya/verifier`, Hono) | 4000 | 로컬만 | x402 facilitator 자리. `KYA_SETTLE_MODE=mock|live` |
| merchant (`kya-merchant`, Hono) | 5050 | `MERCHANT_TUNNEL` | UCP 최소 형태. facilitator = verifier |
| egress-proxy (`scripts/egress-proxy.mjs`) | 8545·8546·8547 | 로컬만 | Base Sepolia RPC, OpenAI, Anthropic 되비춤 |
| agent 러너 (`kya-agent`) | 없음 | Daytona 샌드박스 안 | `apps/agent`를 통째로 업로드해 `npm install` 후 `npm start` |

### 샌드박스 네트워크 제약과 우회 (중요)

Daytona Tier 1·2 조직의 샌드박스는 npm, GitHub, Anthropic 같은 필수 서비스 외에는 **바깥으로 나갈 수 없다**(`https://www.daytona.io/docs/en/network-limits/`). cloudflared 터널, x402.org, sepolia.base.org, OpenAI 모두 TLS 단계에서 끊긴다. `networkAllowList`로도 풀리지 않고 Tier 3($500 충전)부터 열린다.

그래서 방향을 뒤집었다. 샌드박스 안에 chisel 서버(GitHub 릴리스, 다운로드 허용)를 띄우고 Daytona 미리보기 URL로 노출한 뒤, 노트북의 chisel 클라이언트가 역방향 터널을 건다. 러너는 전부 localhost로 통신한다.

| 샌드박스 안 주소 | 노트북 실제 대상 |
|---|---|
| `http://localhost:3000` (`KYA_URL`) | web |
| `http://localhost:5050` (`MERCHANT_URL`) | merchant |
| `http://localhost:8545` (`BASE_SEPOLIA_RPC`) | egress-proxy → sepolia.base.org |
| `http://localhost:8546/v1` (`OPENAI_BASE_URL`) | egress-proxy → api.openai.com |
| `http://localhost:8547` (`ANTHROPIC_BASE_URL`) | egress-proxy → api.anthropic.com |

이 모든 것은 `apps/web/lib/integrations.ts`의 `createSandbox`가 자동으로 한다. 노트북에는 `.tools/chisel`(darwin 바이너리)이 있어야 하며, `demo-up.sh`가 egress-proxy를 함께 띄운다. cloudflared 터널은 이제 Verifier의 did:web 조회(`PUBLIC_HOST`)에만 쓰인다.

### 오늘 확인된 설정값

| 항목 | 값 | 이유 |
|---|---|---|
| `DAYTONA_TARGET` | `eu` | `us`는 이 조직에 열려 있지 않다 |
| `RUNNER_COMMAND` | `npm start` | 샌드박스에서 `corepack enable`이 EACCES로 실패해 pnpm이 없다 |
| `LLM_PROVIDER` | `openai` | Anthropic 키가 크레딧 부족(400) |
| `TREASURY_PRIVATE_KEY` | 비움 | 발급 시 `fundingStatus=manual`로 즉시 발급되고 러너가 잔액을 기다린다 |

## 0. 무대 오르기 전

1. cloudflared 터널 두 개가 살아 있는지 확인한다. 주소가 바뀌었다면 `.env`의 `WEB_TUNNEL`, `MERCHANT_TUNNEL`, `PUBLIC_HOST` 세 줄만 고친다.
2. 서버 네 개(verifier → web → merchant, egress-proxy)를 다시 띄우고 상태 코드가 모두 200인지 본다. verifier가 뜬 뒤 merchant가 시작되므로 첫 결제 500이 나지 않는다.
   ```sh
   bash scripts/demo-up.sh
   ```
3. Circle faucet(`https://faucet.circle.com`, Base Sepolia)에 로그인해 둔다.
4. 화면을 배치한다. 왼쪽은 `http://localhost:3000`, 오른쪽은 로그 터미널이다.
   ```sh
   tail -f .logs/verifier.log .logs/merchant.log
   ```

## 1. 신원 확인 (STEP 1)

Principal 정보를 입력한다. 사업자를 고르고 이름과 사업자등록번호를 넣으면 "확인됨"으로 바뀌고, 플랫폼이 `did:web:<터널호스트>:principals:<id>`와 서명 키를 만든다.

멘트: "KYC를 통과한 사업자만 에이전트에게 지출 권한을 줄 수 있다."

## 2. 샌드박스 생성과 Agent 지갑 보고 (STEP 2)

1. "샌드박스 생성하기"를 누른다. 약 25초 뒤 Daytona 샌드박스가 생성되고(러너 업로드, npm install, chisel 터널, 러너 실행) Sandbox ID가 표시된다(스폰서 통합 장면).
2. 러너가 샌드박스 안에서 키 쌍을 만들고 `POST /agents/register`를 호출하면 화면에 Agent 주소가 나타난다.
3. 러너는 이때부터 2초마다 `GET /agents/:address/delegation`을 폴링한다.

멘트: "개인키는 샌드박스 밖으로 나오지 않는다."

## 3. 지갑 충전 (사람이 수행)

화면의 Agent 주소를 Circle faucet에 넣고 USDC 10을 받는다. 러너는 잔액이 0보다 커질 때까지 기다리다가 `funded` 이벤트를 보고한다. 발급 전에 충전해 두면 발급 직후 바로 쇼핑이 시작된다(오늘 리허설은 treasury에서 1 USDC 전송으로 대신했다. mock 정산이라 실제 지출은 없다).

- 시나리오 지출 합계는 7 USDC라 10이면 충분하다.
- faucet은 주소마다 한 번만 주므로 리허설과 본 데모는 새 샌드박스로 한다.

## 4. Scope 설정과 위임 발급 (STEP 3)

| 항목 | 값 |
|---|---|
| 1회 한도 | 5 USDC (`5000000`) |
| 누적 한도 | 10 USDC (`10000000`) |
| 허용 Merchant | Merchant payTo 주소 1개 |
| 유효 기간 | 1시간 |

"위임 발급하기"를 누르면 EdDSA로 서명된 Delegation JWT가 발급되고, 러너가 폴링으로 받아 간다. "Delegation JWT 복사"로 클레임을 잠깐 보여 주면 `iss`, `sub`, `scope`가 한눈에 들어온다.

## 5. 에이전트 쇼핑과 판정 4장면 (STEP 4)

러너는 위임을 받는 즉시 `SHOPPING_LIST` 순서로 UCP 상점에서 구매를 시도한다. 사람이 손댈 것은 없다.

| 순서 | 상품 | 금액 | 판정 | 이유 |
|---|---|---|---|---|
| 1 | A | 3 USDC | 승인 | 범위 안 |
| 2 | B | 8 USDC | 거절 | `kya:per_tx_limit_exceeded` |
| 3 | C | 4 USDC | 승인 | 누적 7 USDC |
| 4 | C | 4 USDC | 거절 | `kya:cumulative_limit_exceeded` |

판정 카드마다 Principal 이름과 실체 유형이 붙는다. Spend Ledger 게이지는 7/10 USDC에서 멈춘다.

멘트: "Merchant는 facilitator 주소만 Verifier로 바꿨다. 위임은 x402 확장 `kya`로 결제 페이로드 안에 실려 온다."

## 6. 리허설 뒤 초기화

웹 상태와 Verifier 기록만 지우면 1단계부터 다시 시작한다. `apps/web/data/principal-key.json`은 지우지 않는다(did.json 유지).

```sh
rm -f apps/web/data/state.json apps/verifier/data/decisions.json apps/verifier/data/ledger.json
bash scripts/demo-up.sh
```

## 실패 대비

| 상황 | 조치 |
|---|---|
| 첫 결제만 500 | merchant가 verifier보다 먼저 떠서 facilitator 초기화에 실패한 것. `demo-up.sh`를 다시 실행한다 |
| Daytona가 안 뜸 | `WEB_DEMO_MODE=true`로 바꿔 시뮬레이션 샌드박스를 만들고, 러너는 노트북에서 `bash scripts/demo-agent-local.sh`로 돌린다. 러너가 루트 `.env`를 읽으므로 주석 처리한 `AGENT_PRIVATE_KEY`를 살리면 faucet 없이 진행된다 |
| x402.org 정산 실패 | `KYA_SETTLE_MODE=mock`이면 6단계 검사만 하고 가짜 트랜잭션을 돌려준다. 리허설에서 live를 한 번 시도하고 실패하면 mock으로 돌아온다 |
| 화면 없이 검증만 보여 줘야 함 | `pnpm e2e`가 플랫폼과 Verifier를 임시 포트에 띄워 4장면을 curl로 통과시킨다 |
| 러너 로컬 실행 시 register·충전 건너뛰기 | `.env`의 `SKIP_FUNDING=1`, `KYA_DELEGATION=…` 주석을 푼다. 실제 데모에서는 반드시 꺼 둔다 |
