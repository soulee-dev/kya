# 세션 1 브리프: Verifier 서비스 (`apps/verifier`)

먼저 `CONTEXT.md`, `docs/04-contract.md`(접점 2, 3), `docs/03-ucp-x402-facts.md`(x402 v2 절)를 읽는다. 다른 디렉터리는 건드리지 않는다. `apps/web`은 다른 세션이 만든다.

## 만들 것
Hono + TypeScript 단독 패키지(자체 package.json, 포트 4000). x402 facilitator와 같은 인터페이스를 제공하되, 그 앞에서 KYA 검사를 한다.

- `GET /supported`: `UPSTREAM_FACILITATOR/supported` 응답에 `extensions`에 `"kya"` 추가
- `POST /verify`, `POST /settle`: 본문 `{ x402Version, paymentPayload, paymentRequirements }`. 검사 6단계(계약 접점 3의 순서와 거절 코드 그대로) → 통과 시 상위로 동일 본문 전달. settle의 상위 응답이 `success: true`면 Spend Ledger `ledger[jti] += amount`
- `GET /decisions`: 최신순 판정 목록 `[{ at, jti, payer, payTo, amount, decision, reason, txHash?, principal:{name,entityType} }]`
- `GET /ledger/:jti`: `{ spent, cumulativeLimit }`
- CORS 전체 허용(웹 화면이 다른 포트에서 폴링)

## 검사 세부
- Delegation은 `paymentPayload.extensions.kya.info.delegation` (JWT compact)
- 서명 검증 키: `iss`(did:web)를 `https://<host>/.well-known/did.json` 으로 변환해 fetch, 60초 캐시. `jose`의 `jwtVerify`, EdDSA
- `sub`의 주소(`did:pkh:eip155:84532:0x…` 마지막 부분)와 `paymentPayload.payload.authorization.from`을 소문자로 비교
- 금액은 모두 atomic 문자열, `BigInt`로 비교
- Ledger는 메모리 Map + `data/ledger.json`에 즉시 기록, 시작 시 읽기

## 환경 변수
`UPSTREAM_FACILITATOR=https://x402.org/facilitator`, `KYA_SETTLE_MODE=live|mock`, `PORT=4000`
mock이면 상위 호출 없이 verify `{ isValid:true, payer }`, settle `{ success:true, transaction:"0xmock…", network }`

## 완료 기준
테스트 픽스처를 직접 만든다: 키 쌍 생성 → did.json을 로컬 스텁 서버로 띄우거나 `DID_DOC_OVERRIDE` 환경 변수로 주입 → JWT 4개 시나리오(3 승인, 8 거절 per_tx, 4 승인, 4 거절 cumulative)를 `curl`로 mock 모드에서 통과시킨다. 이 스크립트를 `apps/verifier/scripts/scenario.sh`로 남긴다.
