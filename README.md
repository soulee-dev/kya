# KYA (Know Your Agent)

용어는 `CONTEXT.md`, 계획은 `docs/02-plan.md`, 팀원과의 접점 계약은 `docs/04-contract.md`.

```
packages/core      @kya/core      도메인 로직. 프레임워크 없음. 발급(접점 1, 4)과 검증(접점 3) 모두 여기에 있다
apps/web           @kya/web       Next.js :3000  발급 콘솔 + 발급 API + did.json. core를 호출하는 얇은 HTTP·화면 계층
apps/verifier      @kya/verifier  Hono :4000     x402 facilitator 자리의 Verifier (접점 3)
scripts/e2e.sh     웹과 Verifier를 함께 띄워 데모 4장면 통과
docs/slides        Slidev 발표 자료
```

## 실행

```sh
pnpm install       # 루트에서 한 번. 워크스페이스 전체(core, web, verifier, slides)를 설치한다
pnpm test          # core 단위 테스트 (6단계 검사, JWT, 원장)
pnpm typecheck     # 모든 패키지
pnpm scenario      # Verifier 단독: mock 모드 + DID_DOC_OVERRIDE 로 4장면 curl
pnpm e2e           # 웹이 발급한 JWT를 Verifier가 실제 did.json 조회로 검사 (둘 다 자동으로 띄운다)

cp .env.example .env                       # verifier 용
cp apps/web/.env.example apps/web/.env.local
pnpm verifier      # :4000
pnpm web           # :3000
pnpm fake-agent    # 실행 중인 웹에 러너 없이 register → 발급 → did.json 검증 (ISSUE_DELEGATION=1)
```

## `@kya/core` 모듈

| 파일 | 역할 |
|---|---|
| `types.ts` | Principal, Scope, DelegationClaims, Decision, x402 v2 타입, 상수(네트워크·USDC·충전액). `@kya/core/types`로 브라우저에서도 import 가능 |
| `did.ts` | `did:web` ↔ `/.well-known/did.json`, `did:pkh` ↔ 주소, DID 문서 생성 |
| `keys.ts` | Principal 서명 키(EdDSA/Ed25519) 생성·파일 보관 |
| `delegation.ts` | `issueDelegation` / `verifyDelegation`, did:web 리졸버(60초 캐시) |
| `check.ts` | `checkPayment`: 접점 3의 6단계 검사, 거절 코드 그대로 |
| `ledger.ts` | Spend Ledger (메모리 + JSON 파일) |
| `verifier.ts` | `createVerifier`: supported / verify / settle / decisions / ledgerFor. `mode: live|mock` |
| `funding.ts` | Treasury: viem으로 Base Sepolia USDC 전송 (`send` / `confirm` / `fund`) |
| `sandbox.ts` | Daytona 샌드박스 생성, 러너 업로드, 환경 변수 주입, 백그라운드 실행 |
| `store.ts` | `JsonState`: 메모리 상태 + JSON 파일 즉시 기록 |

core는 TS 소스를 그대로 내보낸다. Next.js에서는 `transpilePackages: ["@kya/core"]`가 필요하고, 상대 import에 확장자를 붙이지 않는다(Turbopack이 `.js` → `.ts`를 해석하지 않는다).

## Verifier 라우트 (`apps/verifier`, 접점 3)

| 라우트 | 동작 |
|---|---|
| `GET /supported` | 상위 facilitator 응답 + `extensions: [..., "kya"]` |
| `POST /verify` | 6단계 검사 → 통과 시 상위 `/verify` 프록시. 실패 `{ isValid:false, invalidReason:"kya:<code>", payer }` |
| `POST /settle` | 6단계 검사 → 상위 `/settle` → `success` 면 `ledger[jti] += amount` |
| `GET /decisions?phase=verify|settle&limit=` | 최신순 판정. 카드에 `principal:{name,entityType}` 포함 |
| `GET /ledger/:jti` | `{ jti, spent, cumulativeLimit }` |

환경 변수: `UPSTREAM_FACILITATOR`, `KYA_SETTLE_MODE=live|mock`, `PORT`, `DATA_DIR`, `DID_DOC_OVERRIDE`(파일 경로 또는 JSON).

## 발급 라우트 (`apps/web`, 접점 1·4)

`/api/*` 를 기본으로 두고, 러너 계약 경로(`/principals`, `/sandboxes`, `/delegations`, `/agents/*`)는 `next.config.ts`의 rewrite로 같은 핸들러에 연결한다. 자세한 동작과 환경 변수는 `apps/web/README.md`.

| 라우트 | 동작 |
|---|---|
| `GET /.well-known/did.json` | Principal 공개키 (host 단위 키 하나, `apps/web/data/principal-key.json`) |
| `GET /principals/:id/did.json` | 같은 키를 Principal DID 문서로 |
| `POST /api/principals` | `{ entityType, name, registrationNumber? }` → 확인됨(스텁) + `did:web:<host>:principals:<id>` |
| `POST /api/sandboxes` | Daytona 생성 + 러너 업로드 + 실행. `WEB_DEMO_MODE=true` 면 `local-…` id |
| `POST /api/agents/register` | `{ sandboxId, address }` |
| `GET /api/agents/:address/delegation` | 발급 전 404, 후 `{ delegation }` |
| `POST /api/delegations` | `{ principalId, address, scope }` → JWT + treasury 충전(영수증 확인까지) |
| `POST /api/agents/:address/events` | `{ step, message }` |
| `GET /api/state` | 화면 폴링용 한 방 응답 |
| `GET /api/verifier/decisions`, `/api/verifier/ledger/:jti` | `VERIFIER_URL`로 프록시 |

## 판정 카드의 형태

```json
{ "at":"…", "phase":"settle", "jti":"…", "payer":"0x…", "payTo":"0x…", "amount":"4000000",
  "decision":"denied", "reason":"kya:cumulative_limit_exceeded", "principal":{"name":"Acme Corp","entityType":"business"} }
```
