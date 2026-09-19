# 세션 2 브리프: KYA 웹 (`apps/web`)

먼저 `CONTEXT.md`, `docs/04-contract.md`(접점 1, 4), `docs/01-daytona-sdk-facts.md`를 읽는다. `apps/verifier`는 다른 세션이 만든다. Verifier는 `VERIFIER_URL`로만 접근한다(화면의 판정 칸은 `GET {VERIFIER_URL}/decisions`를 폴링).

## 만들 것
Next.js 단독 패키지(자체 package.json, 포트 3000). 발급 쪽 API와 데모 화면.

### API 라우트
- `GET /.well-known/did.json`: Principal 공개키(EdDSA, JWK). 키는 서버 시작 시 생성해 `data/principal-key.json`에 저장, 재시작해도 유지
- `POST /api/principals`: `{ entityType:"person"|"business", name, registrationNumber }` → 신원 확인 스텁(항상 확인됨) → `{ principalId, did:"did:web:<host>:principals:<id>", verifiedAt }`
- `POST /api/sandboxes`: `@daytona/sdk`로 샌드박스 생성. `envVars`는 계약 접점 4의 표 그대로. 러너 파일은 `RUNNER_DIR`(팀원이 준 디렉터리)을 통째로 업로드하고 `executeCommand`로 실행. 응답 `{ sandboxId }`
- `POST /api/agents/register`: `{ sandboxId, address }` 저장
- `GET /api/agents/:address/delegation`: 발급 전 404, 발급 후 `{ delegation }`
- `POST /api/delegations`: `{ principalId, address, scope }` → 계약 접점 1의 클레임으로 JWT 발급(`jose`, EdDSA, `exp` 1시간) → 저장 → `{ delegation, jti }`. **온체인 송금은 하지 않는다.** 대신 화면 1칸에 agent 주소를 복사 버튼과 함께 크게 표시(발표자가 Circle faucet에 붙여 넣음)
- `POST /api/agents/:address/events`: `{ step, message }` 로그 저장
- `GET /api/state`: 화면 폴링용 한 방 응답 `{ principal, sandbox, agent:{address, funded}, delegation:{jti, scope, exp}, events[] }`

### 화면 (한 페이지 네 칸, 1초 폴링)
1. 신원 확인 → Delegation 발급: 폼 → "확인됨" 배지 → 샌드박스 생성 버튼 → Agent 주소가 등록되면 표시 → Scope 폼(기본값: 1회 5, 누적 10 USDC, Merchant payTo, 1시간) → 발급 버튼 → JWT 요약. 그 옆에 agent 주소 + 복사 버튼 + `viem`으로 조회한 USDC 잔액(1초 폴링, 0에서 커지면 초록색)
2. 샌드박스·Agent 로그: sandbox id, 이벤트 목록
3. Verifier 판정 카드: `{VERIFIER_URL}/decisions`를 폴링. 카드마다 "누가(Principal name) → 누구를 대신해(agent 주소) → 얼마(amount) → 판정과 이유"
4. Spend Ledger 게이지: `{VERIFIER_URL}/ledger/:jti` 로 누적/한도 막대

## 환경 변수
`DAYTONA_API_KEY`, `ANTHROPIC_API_KEY`, `PUBLIC_HOST`(터널 호스트, did:web에 씀), `VERIFIER_URL`, `MERCHANT_URL`, `BASE_SEPOLIA_RPC`(잔액 조회용), `RUNNER_DIR`. 실패 대비용 `AGENT_PRIVATE_KEY`(설정되면 러너에 그대로 주입)

## 완료 기준
러너 없이도 흐름이 돌아야 한다: `curl`로 register를 흉내 내 주소를 넣고, 화면에서 발급까지 눌러 JWT가 나오고 `did.json`으로 검증되는지 `jose`로 확인한다. 이 스크립트를 `apps/web/scripts/fake-agent.sh`로 남긴다.
