# KYA (Know Your Agent) — core

용어는 `CONTEXT.md`, 계획은 `docs/02-plan.md`, 팀원과의 접점 계약은 `docs/04-contract.md`.
이 저장소에는 KYA 플랫폼의 **core**(발급 + 검증)만 있다. 화면(Next.js)은 별도.

```
packages/core      @kya/core   도메인 로직. 프레임워크 없음.
apps/verifier      @kya/verifier  Hono :4000  x402 facilitator 자리의 Verifier (접점 3)
apps/platform      @kya/platform  Hono :4001  발급 API + did.json (접점 1, 4)
scripts/e2e.sh     둘을 함께 띄워 데모 4장면 통과
```

## 실행

```sh
pnpm install
pnpm test          # core 단위 테스트 (6단계 검사, JWT, 원장, 발급)
pnpm scenario      # Verifier 단독: mock 모드 + DID_DOC_OVERRIDE 로 4장면 curl
pnpm fake-agent    # 플랫폼 단독: 러너 없이 register → 발급 → did.json 검증
pnpm e2e           # 플랫폼 발급 JWT를 Verifier가 실제 did.json 조회로 검사

cp .env.example .env
pnpm verifier      # :4000
pnpm platform      # :4001
```

## `@kya/core` 모듈

| 파일 | 역할 |
|---|---|
| `types.ts` | Principal, Scope, DelegationClaims, Decision, x402 v2 타입, 상수(네트워크·USDC·충전액) |
| `did.ts` | `did:web` ↔ `/.well-known/did.json`, `did:pkh` ↔ 주소, DID 문서 생성 |
| `keys.ts` | Principal 서명 키(EdDSA/Ed25519) 생성·파일 보관 |
| `delegation.ts` | `issueDelegation` / `verifyDelegation`, did:web 리졸버(60초 캐시) |
| `check.ts` | `checkPayment`: 접점 3의 6단계 검사, 거절 코드 그대로 |
| `ledger.ts` | Spend Ledger (메모리 + JSON 파일) |
| `verifier.ts` | `createVerifier`: supported / verify / settle / decisions / ledgerFor. `mode: live|mock` |
| `platform.ts` | `createPlatform`: 신원 확인 스텁 → 샌드박스 → register → 발급(+충전) → events → state |
| `funding.ts` | Treasury: viem으로 Base Sepolia USDC 전송 |
| `sandbox.ts` | Daytona 샌드박스 생성, 러너 업로드, 환경 변수 주입, 백그라운드 실행 |

## Verifier 라우트 (`apps/verifier`, 접점 3)

| 라우트 | 동작 |
|---|---|
| `GET /supported` | 상위 facilitator 응답 + `extensions: [..., "kya"]` |
| `POST /verify` | 6단계 검사 → 통과 시 상위 `/verify` 프록시. 실패 `{ isValid:false, invalidReason:"kya:<code>", payer }` |
| `POST /settle` | 6단계 검사 → 상위 `/settle` → `success` 면 `ledger[jti] += amount` |
| `GET /decisions?phase=verify|settle&limit=` | 최신순 판정. 카드에 `principal:{name,entityType}` 포함 |
| `GET /ledger/:jti` | `{ jti, spent, cumulativeLimit }` |

환경 변수: `UPSTREAM_FACILITATOR`, `KYA_SETTLE_MODE=live|mock`, `PORT`, `DATA_DIR`, `DID_DOC_OVERRIDE`(파일 경로 또는 JSON).

## 플랫폼 라우트 (`apps/platform`, 접점 1·4)

같은 라우터를 `/api/*` 와 `/*` 두 곳에 붙였다. 러너는 계약대로 `/agents/...` 를, 화면은 `/api/...` 를 쓰면 된다.

| 라우트 | 동작 |
|---|---|
| `GET /.well-known/did.json` | Principal 공개키 (host 단위 키 하나, `data/principal-key.json`) |
| `POST /principals` | `{ entityType, name, registrationNumber? }` → 확인됨 + `did:web:<host>:principals:<id>` |
| `POST /sandboxes` | Daytona 생성 + 러너 업로드 + 실행. 키가 없으면 `local-…` id |
| `POST /agents/register` | `{ sandboxId, address }` |
| `GET /agents/:address/delegation` | 발급 전 404, 후 `{ delegation, jti, exp }` |
| `POST /delegations` | `{ principalId, address, scope:{perTxLimit, cumulativeLimit, merchants[]} }` → JWT + treasury 충전 |
| `POST /agents/:address/events` | `{ step, message }` |
| `GET /state` | 화면 폴링용 한 방 응답 |

### Next.js에 붙일 때

`createPlatformApp(platform)`은 Hono 앱이므로 `app/api/[[...route]]/route.ts`에서 `hono/vercel`의 `handle()`로 마운트할 수 있다.
`/.well-known/did.json`은 `/api` 밖이므로 `next.config`의 `rewrites`로 `/api/.well-known/did.json`에 연결하거나 별도 route로 둔다.
`@kya/core`는 TS 소스를 그대로 내보내므로 `transpilePackages: ["@kya/core"]`가 필요하다.

## 판정 카드의 형태

```json
{ "at":"…", "phase":"settle", "jti":"…", "payer":"0x…", "payTo":"0x…", "amount":"4000000",
  "decision":"denied", "reason":"kya:cumulative_limit_exceeded", "principal":{"name":"Acme Corp","entityType":"business"} }
```
