# KYA (Know Your Agent)

사람이나 사업자가 에이전트에게 지출 권한을 위임하고, 결제가 실행되기 직전에 그 에이전트가 누구를 대신해 어떤 범위 안에서 행동하는지 검증하는 계층. UCP 같은 상거래 프로토콜과 x402 같은 결제 프로토콜 위에 얹히며, 그 프로토콜들 자체는 이 문맥의 제품이 아니다.

## Language

### 주체

**Principal (위임자)**:
에이전트에게 지출 권한을 위임하는 검증된 실체. 자연인 또는 사업자이며, 신원 확인을 거친 뒤에만 위임을 발급할 수 있다.
_Avoid_: 사장님, 사용자, 소유자, owner, user

**Entity (실체)**:
Principal의 법적 형태. 자연인(natural person) 또는 사업자(business) 둘 중 하나다.
_Avoid_: 계정, account

**Identity Verification (신원 확인)**:
Entity가 실제로 존재하고 Principal이 그 Entity임을 확인하는 절차(KYC/KYB). 이 절차를 통과한 Principal만 Delegation을 발급할 수 있다.
_Avoid_: 가입, 등록, 온보딩, KYC 단독 표기

**Agent (에이전트)**:
Principal을 대신해 상품을 고르고 결제하는 자율 프로그램. 지갑 주소로 식별되며, 격리된 샌드박스 안에서 실행된다.
_Avoid_: 봇, 클라이언트, 지불자

**Merchant (가맹점)**:
상품을 팔고 결제를 요구하는 쪽. UCP 서버와 x402 결제 요구를 제공하는 참조 구현이며, 이 문맥의 제품이 아니다.
_Avoid_: 판매자, 상점, 서버

### 위임

**Delegation (위임)**:
Principal이 특정 Agent에게 발급한 서명된 자격 증명. 주체는 Agent의 지갑 주소이고, 하나의 Scope와 유효 기간을 담는다.
_Avoid_: 권한, 토큰, 인가, 자격증

**Scope (범위)**:
Delegation이 허용하는 지출의 경계. 1회 한도, 누적 한도, 허용 Merchant 목록, 유효 기간으로 이루어진다. 상품 카테고리는 Merchant가 신고한 값을 기준으로만 검사할 수 있으므로 선택 항목이다.
_Avoid_: 제한, 정책, 권한 목록

**Per-Transaction Limit (1회 한도)**:
결제 한 건이 넘을 수 없는 금액.

**Cumulative Limit (누적 한도)**:
Delegation의 유효 기간 동안 정산된 금액의 합이 넘을 수 없는 금액.

**Merchant Allowlist (허용 가맹점 목록)**:
이 Delegation으로 결제할 수 있는 Merchant의 집합.

### 검증

**Verifier (검증자)**:
결제가 정산되기 직전에 Delegation과 Scope를 검사해 승인 또는 거절을 판정하는 KYA 계층. x402 흐름에서는 facilitator 자리에 서며, 이 문맥의 제품이다.
_Avoid_: 게이트웨이, 미들웨어, 검사기

**Decision (판정)**:
Verifier가 결제 한 건에 대해 내리는 결과. 승인(approved) 또는 거절(denied)이며, 거절에는 이유가 붙는다.
_Avoid_: 결과, 응답, 상태

**Spend Ledger (지출 원장)**:
Verifier가 Delegation마다 정산된 금액을 누적해 기록한 장부. 누적 한도 검사의 근거다.
_Avoid_: 잔액, 히스토리, 로그

**Treasury (충전 지갑)**:
플랫폼이 보유한 테스트넷 USDC 지갑. Delegation이 발급되는 순간 Agent 지갑에 자금을 넣어 준다.
_Avoid_: 금고, 펀딩 지갑, 마스터 지갑

### 실행 환경

**Sandbox (샌드박스)**:
Agent 하나가 실행되는 격리된 컴퓨터. Daytona가 제공하며, Agent의 지갑 키는 이 안에서 만들어지고 밖으로 나가지 않는다.
_Avoid_: 컨테이너, 인스턴스, VM
