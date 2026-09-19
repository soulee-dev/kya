# KYA Agent 러너 (B)

`docs/04-contract.md` 접점 4. 샌드박스 안에서 `node runner.mjs` 한 줄로 돈다.

## A가 할 일 (`POST /sandboxes`)
1. `pnpm build`로 만든 **`apps/agent/dist/runner.mjs` 파일 하나**만 업로드 (2.7MB, 의존성 포함). `RUNNER_DIR=apps/agent/dist`.
2. `envVars`: 계약 표 그대로 `KYA_URL`, `MERCHANT_URL`, `SANDBOX_ID`, `ANTHROPIC_API_KEY`, `SHOPPING_LIST`(선택).
3. `executeCommand("node runner.mjs")`. 이미지 `node:22`.

## 부팅 순서
키 생성 → `POST {KYA_URL}/agents/register` → `GET /agents/{address}/delegation` 2초 폴링 → USDC 잔액 > 0 대기 → `SHOPPING_LIST` 있으면 그 순서로 구매 → 이후 `GET {MERCHANT_URL}/commands/next` 폴링(스토어프론트 채팅).

## 선택 env
| 변수 | 의미 |
|---|---|
| `ANTHROPIC_MODEL` | 기본 `claude-sonnet-5` |
| `BASE_SEPOLIA_RPC` | 기본 `https://sepolia.base.org` |
| `AGENT_PRIVATE_KEY` | 충전 실패 대비(D6 하향). 지정하면 키 생성 생략 |
| `KYA_DELEGATION` | `KYA_URL` 없이 로컬 실행할 때 직접 주입 |
| `SKIP_FUNDING=1` | 잔액 대기 생략(로컬) |

## 로컬 검증
```
cd apps/merchant && npx tsx scripts/mock-facilitator.ts &          # A Verifier 대타 :4000
FACILITATOR_URL=http://localhost:4000 MERCHANT_PAYTO=0x... npx tsx src/index.ts &   # :5050
cd apps/agent && KYA_DELEGATION=demo npx tsx scripts/scenario.ts   # LLM 없이 A,B,C,C 결제
node --env-file=.env.local --import tsx src/index.ts               # 실제 러너 (채팅 폴링)
curl -X POST localhost:5050/commands -H 'content-type: application/json' -d '{"text":"10만원짜리 자켓 찾아줘"}'
```
