# KYA Web

Next.js App Router + TypeScript + pnpm + shadcn/ui (Radix) + Tailwind CSS v4. `apps/verifier`와 독립적으로 실행하는 Principal 신원 확인·Delegation 발급 콘솔입니다.

## 실행

```sh
cd apps/web
pnpm install
cp .env.example .env.local
pnpm dev
```

http://localhost:3000 에서 확인합니다. 기본 예제 환경은 `WEB_DEMO_MODE=true`입니다. 신원 확인 → 데모 샌드박스 생성 → 데모 Agent 주소 입력 → Merchant 주소와 Scope 입력 → 위임 발급 순서로 진행합니다. 유효한 테스트 주소 예: Agent `0x1111111111111111111111111111111111111111`, Merchant `0x2222222222222222222222222222222222222222`.

- 신원 확인은 **항상 데모 스텁**이며 실제 KYC/KYB 심사가 아닙니다. 사업자등록번호는 형식만 확인하고 저장하지 않습니다.
- 로컬 데모의 샌드박스는 시뮬레이션이며 실제 USDC 충전은 없습니다. EdDSA JWT 서명·검증은 실제로 수행합니다.
- Verifier 판정과 Spend Ledger는 `VERIFIER_URL`의 실제 응답만 표시합니다. 연결되지 않으면 대기로 표시합니다. 화면은 1초 간격으로 다시 조회합니다. 원장 응답은 atomic 문자열 `spent`를 권장하며 `totalSpent`, `total`, `amount`도 읽습니다.
- 단일 Principal·Sandbox·Agent를 위한 해커톤 콘솔입니다. 인증 및 다중 Principal 격리를 포함하지 않으므로 인터넷에 공개한 운영 서비스로 사용하지 않습니다.

## 실제 연동

`.env.local`에서 `WEB_DEMO_MODE=false`와 Daytona·Anthropic·Treasury 환경 변수를 설정합니다. `PUBLIC_HOST`는 러너가 접근할 수 있는 터널 호스트, `RUNNER_DIR`은 팀원 러너의 절대 경로입니다. 러너는 `package.json`과 `start` 스크립트를 제공해야 합니다. `RUNNER_COMMAND`로 실행 명령을 바꿀 수 있습니다.

Daytona에 러너 디렉터리를 업로드하고 pnpm으로 의존성을 설치한 뒤 백그라운드 실행합니다. `.env*`, `node_modules`, `.git`, `.next`, 심볼릭 링크는 업로드하지 않습니다. 샌드박스 생성 후 알 수 있는 `SANDBOX_ID`는 실행 시 주입하며, 나머지 환경 변수는 계약 접점 4를 따릅니다. 실제 위임 발급은 Treasury의 20 USDC 전송 영수증까지 확인해야 완료됩니다. 대기 중인 트랜잭션 해시를 저장하므로 재시도 시 동일 해시를 확인합니다. RPC가 트랜잭션을 수신한 뒤 응답을 유실하는 경우까지 보장하는 분산 송금 멱등성은 구현하지 않았습니다.

서버 시작 시 `data/principal-key.json`에 Ed25519 키를 생성하고 재사용합니다. `data/state.json`에 화면 상태를 저장합니다. 이 파일들은 Git에서 제외됩니다. 로컬 단일 서버 프로세스와 지속 디스크를 전제로 하며 서버리스 배포용 저장소는 아닙니다. 데모를 초기화하려면 서버 종료 후 `data/state.json`을 삭제합니다. 키 파일은 유지할 수 있습니다.

## API

브리프의 `/api/principals`, `/api/sandboxes`, `/api/agents/register`, `/api/agents/:address/delegation`, `/api/agents/:address/events`, `/api/delegations`, `/api/state`를 제공합니다. 러너 계약에 맞춰 `/principals`, `/sandboxes`, `/agents/*`, `/delegations`도 같은 API로 연결합니다.

공개키: `/.well-known/did.json`. `did:web` 경로 해석을 위한 `/principals/:id/did.json`도 제공합니다. JWT와 API의 모든 금액은 USDC atomic units 문자열입니다. 화면만 사람이 읽는 USDC 단위를 사용합니다.

Verifier 요청은 서버의 `/api/verifier/decisions`, `/api/verifier/ledger/:jti`를 통해 전달하므로 브라우저 CORS 설정 없이 연결됩니다. Verifier 검증·정산 자체는 별도 패키지의 책임입니다.

## 검증

```sh
pnpm typecheck
pnpm build
pnpm exec playwright install chromium
pnpm test
# 실행 중인 로컬 데모 서버에 Agent 주소만 등록
bash scripts/fake-agent.sh
# 자동 발급 및 jose 공개키 검증까지
ISSUE_DELEGATION=1 bash scripts/fake-agent.sh
```

브라우저 테스트는 포트 3100과 임시 데이터 디렉터리를 사용합니다. 화면 진행, 잘못된 Scope 거절, 미발급 404, JWT 공개키 검증, 중복 발급 멱등성, 다른 Agent 등록 거절, 모바일 가로 넘침을 확인합니다.

## UI 컴포넌트

`components/ui/`는 shadcn/ui CLI로 추가한 기본 컴포넌트입니다. Sidebar, Dialog, Label, Separator와 기존 Button, Input, Card, Badge, Tabs, Progress, Alert를 기본 스타일로 사용합니다. `components.json`에 별칭과 스타일을 설정했습니다.

`app/globals.css`에는 Tailwind import, shadcn 테마 토큰(색상·폰트·모서리), 기본 base layer만 있습니다. 기존 화면 전용 CSS와 컴포넌트 덮어쓰기는 제거했습니다. 화면 배치는 페이지의 Tailwind 유틸리티로 구성합니다. 기본 경로 `/`에서 항상 같은 UI가 표시되며 별도 쿼리 옵션은 없습니다.

추가 컴포넌트는 `apps/web`에서 `pnpm dlx shadcn@latest add <component>`로 설치합니다. 생성된 컴포넌트의 `cn` import는 `@/lib/utils`를 사용합니다.
