# 두 사람 사이의 계약 (2026-09-19 14:25 확정)

용어는 `CONTEXT.md`를 따른다. 스펙 근거는 `03-ucp-x402-facts.md`.
A = KYA 플랫폼(본인). B = Merchant + Agent(팀원). 두 사람이 만나는 지점은 아래 네 곳뿐이다. 여기 적힌 형식은 당일 바꾸지 않는다.

## 공통 상수

| 항목 | 값 |
|---|---|
| 네트워크 | `eip155:84532` (Base Sepolia) |
| 자산 | USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (6 decimals) |
| 금액 단위 | **모든 곳에서 atomic units 문자열** (1 USDC = `"1000000"`). UCP totals(minor units)와 섞이지 않도록 Merchant 상품 가격도 USDC atomic으로 둔다 |
| 상위 facilitator | `https://x402.org/facilitator` (키 불필요, v2 exact 지원) |
| x402 버전 | 2. 헤더 `PAYMENT-REQUIRED` / `PAYMENT-SIGNATURE` / `PAYMENT-RESPONSE` |
| 패키지 | `@x402/core`, `@x402/hono`, `@x402/fetch`, `@x402/evm` 2.26.0, `viem`, `jose`, `@daytona/sdk`, `@anthropic-ai/sdk` |
| 데모 Scope | 1회 `5000000`, 누적 `10000000`, 허용 Merchant = Merchant payTo 주소 1개, 유효 1시간 |
| 데모 상품 | A `3000000`, B `8000000`, C `4000000`. 순서: A 승인 → B 거절(1회 한도) → C 승인 → C 거절(누적 한도) |

## 접점 1. Delegation JWT (A가 발급, B의 Agent가 소지)

- 서명: Principal 키(EdDSA, A가 보관). 검증 키는 `GET {KYA_URL}/.well-known/did.json` 에 공개.
- 형식: JWT compact. 클레임:

```json
{
  "iss": "did:web:<kya-host>:principals:<principalId>",
  "sub": "did:pkh:eip155:84532:0x<agentAddress>",
  "jti": "<uuid>",
  "iat": 0, "exp": 0,
  "vc": {
    "type": ["VerifiableCredential", "AgentDelegation"],
    "credentialSubject": {
      "id": "did:pkh:eip155:84532:0x<agentAddress>",
      "sandboxId": "<daytona sandbox id>",
      "principal": { "entityType": "business", "name": "...", "verifiedAt": "..." },
      "scope": {
        "network": "eip155:84532",
        "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        "perTxLimit": "5000000",
        "cumulativeLimit": "10000000",
        "merchants": ["0x<merchant payTo>"]
      }
    }
  }
}
```

- `sub`의 주소는 반드시 x402 결제 서명의 `authorization.from`과 같아야 한다. 이것이 소지 증명이다.

## 접점 2. x402 확장 `kya` (B의 Merchant가 광고, B의 Agent가 회신)

Merchant의 402 응답(`PAYMENT-REQUIRED`):
```json
{
  "x402Version": 2,
  "resource": { "url": "https://<merchant>/checkout-sessions/<id>/complete" },
  "accepts": [{ "scheme": "exact", "network": "eip155:84532", "amount": "3000000",
                "asset": "0x036C...", "payTo": "0x<merchant>", "maxTimeoutSeconds": 60,
                "extra": { "name": "USDC", "version": "2" } }],
  "extensions": {
    "kya": {
      "info": { "verifier": "https://<kya-host>", "required": true },
      "schema": { "type": "object", "properties": { "delegation": { "type": "string" } } }
    }
  }
}
```

Agent의 결제 페이로드(`PAYMENT-SIGNATURE`, base64 JSON): 위 `extensions.kya`를 그대로 되돌리되 `info.delegation`을 덧붙인다.
```json
{ "x402Version": 2, "resource": {...}, "accepted": {...},
  "payload": { "signature": "0x...", "authorization": { "from": "0x<agent>", "to": "0x<merchant>", "value": "3000000", ... } },
  "extensions": { "kya": { "info": { "verifier": "...", "required": true, "delegation": "<JWT>" }, "schema": {...} } } }
```

Merchant는 `@x402/hono` 미들웨어의 facilitator URL을 **A의 Verifier**로 지정하기만 하면 된다. Delegation은 페이로드 안에 있으므로 Merchant 코드는 건드리지 않는다.

## 접점 3. Verifier API (A가 제공, B의 Merchant가 호출)

x402 facilitator 인터페이스와 동일하다. 본문은 모두 `{ "x402Version": 2, "paymentPayload": {...}, "paymentRequirements": {...} }`.

| 엔드포인트 | 동작 |
|---|---|
| `GET /supported` | 상위 facilitator 응답에 `extensions: ["kya"]` 추가 |
| `POST /verify` | KYA 검사 → 통과 시 상위 `/verify`로 그대로 전달. 실패 시 `{ "isValid": false, "invalidReason": "kya:<code>", "payer": "0x..." }` |
| `POST /settle` | KYA 검사 → 상위 `/settle` 전달 → `success: true`면 Spend Ledger에 `jti`별로 금액 가산 |
| `GET /decisions` | UI 폴링용. 판정 목록 `[{ at, jti, payer, payTo, amount, decision, reason, txHash? }]` |

KYA 검사 순서와 거절 코드:
1. `extensions.kya.info.delegation` 없음 → `kya:missing_delegation`
2. JWT 서명·`exp` 검증 실패 → `kya:invalid_delegation`
3. `sub` 주소 ≠ `payload.authorization.from` → `kya:subject_mismatch`
4. `paymentRequirements.payTo` ∉ `scope.merchants` → `kya:merchant_not_allowed`
5. `amount` > `perTxLimit` → `kya:per_tx_limit_exceeded`
6. `ledger[jti] + amount` > `cumulativeLimit` → `kya:cumulative_limit_exceeded`

실패 대비 플래그 `KYA_SETTLE_MODE=mock`: 1~6만 검사하고 상위 호출 없이 `{ success: true, transaction: "0xmock..." }`을 돌려준다.

## 접점 4. 샌드박스 부팅 순서 (A가 생성, B의 Agent 러너가 수행)

A의 `POST /sandboxes` 가 Daytona 샌드박스를 만들고 B의 러너 파일을 업로드한 뒤 실행한다. 주입되는 환경 변수:

| 변수 | 의미 |
|---|---|
| `KYA_URL` | A의 플랫폼 URL(터널) |
| `MERCHANT_URL` | B의 Merchant URL |
| `SANDBOX_ID` | Daytona sandbox id |
| `ANTHROPIC_API_KEY` | LLM |
| `SHOPPING_LIST` | `"A,B,C,C"` 고정 시나리오 |

러너가 부팅 시 하는 일:
1. `viem`으로 키 쌍 생성. 개인키는 메모리에만 둔다.
2. `POST {KYA_URL}/agents/register` 본문 `{ "sandboxId", "address" }`.
3. `GET {KYA_URL}/agents/{address}/delegation` 을 2초마다 폴링. Principal이 발급하면 `{ "delegation": "<JWT>" }`, 아직이면 404.
4. A는 발급과 동시에 treasury 지갑에서 agent 주소로 테스트넷 USDC `20000000`을 송금한다(**자금 충전**). 러너는 USDC 잔액이 0보다 커질 때까지 기다린다.
5. Claude Tool Runner 시작. 도구 세 개: `list_products`, `create_checkout(productId)`, `complete_checkout(sessionId)`. `complete_checkout`이 402를 만나면 `@x402/evm` 서명 + `extensions.kya` 회신.
6. 각 시도 결과를 `POST {KYA_URL}/agents/{address}/events` 로 보고(UI 로그용). 본문 `{ "step", "message" }`.

## Merchant 최소 UCP 형태 (B)

- `GET /.well-known/ucp` : `payment_handlers` 에 `com.kya.x402` 하나 선언
- `GET /products`
- `POST /checkout-sessions` → `{ id, line_items, totals:[{type:"total", amount}], status:"ready_for_complete" }`
- `POST /checkout-sessions/:id/complete` → `@x402/hono` 보호. 결제 성공 시 `status:"completed"`

## 사전 확보 (14:35까지)

- A: Daytona API 키, Anthropic API 키, `cloudflared` 터널, treasury 지갑(Base Sepolia ETH 소량 + Circle faucet USDC)
- B: Merchant payTo 주소(아무 EOA), Hono 골격
