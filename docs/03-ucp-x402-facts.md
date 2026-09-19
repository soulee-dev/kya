# UCP / x402 1차 출처 조사 (2026-09-19 기준)

모든 사실에 출처 URL을 붙였다. 확인 못 한 것은 "미확인"으로 표시.

---

## 1. UCP (Universal Commerce Protocol)

### 1.1 개요·버전·저장소
- Google CEO가 NRF 2026 (2026-01-11)에서 발표. Google+Shopify 공동 개발, Apache 2.0. — https://blog.google/company-news/inside-google/message-ceo/nrf-2026-remarks/ , https://www.axios.com/2026/01/11/google-shopify-ai-shopping-standard-nrf-2026
- 현재 스펙 버전 `2026-08-25` (YYYY-MM-DD 형식). GitHub 태그: v2026-01-11, v2026-01-23, v2026-04-08, v2026-08-25(최신, 2026-08-25 릴리스). — https://ucp.dev/specification/overview/ , https://github.com/Universal-Commerce-Protocol/ucp/releases/tag/v2026-08-25
- 조직 저장소: `ucp`(스펙), `python-sdk`, `js-sdk`, `samples`, `conformance`, `ucp-schema`, `meeting-minutes`. — https://github.com/Universal-Commerce-Protocol (GitHub API로 확인)
- 전송(transport): `rest`, `mcp`, `a2a`, `embedded` 4종. ucp.dev 랜딩은 AP2/A2A/MCP/JSON-RPC/Embedded UI를 나열. — https://ucp.dev/specification/overview/ , https://ucp.dev/

### 1.2 Discovery: `/.well-known/ucp`
- 비즈니스는 `/.well-known/ucp`에 프로필 공개. 플랫폼(에이전트)은 자기 프로필 URI를 `UCP-Agent` 헤더로 광고. — https://ucp.dev/specification/overview/
- 프로필 형태(필수: `ucp.version`, `ucp.services`, `ucp.payment_handlers`(비어도 필수); 선택: `ucp.capabilities`, `ucp.supported_versions`, 최상위 `keys[]` JWKS):
  ```json
  {"ucp":{"version":"2026-08-25","services":{...},"capabilities":{...},"payment_handlers":{...}},"keys":[...]}
  ```
- 서비스 바인딩 예: `{"version":"2026-08-25","transport":"rest","schema":"https://ucp.dev/2026-08-25/services/shopping/rest.openapi.json","endpoint":"https://business.example.com/ucp/v1"}` — https://ucp.dev/specification/overview/
- capability 선언 예: `"dev.ucp.shopping.checkout":[{"version":"2026-08-25","spec":"...","schema":"https://ucp.dev/2026-08-25/schemas/shopping/checkout.json"}]`; 확장은 `"extends":"dev.ucp.shopping.checkout"` (배열 가능). — 같은 페이지
- 캐퍼빌리티 목록(내비게이션): shopping `checkout`, `cart`, `catalog`, `order`; 확장 `fulfillment`, `discount`, `buyer-consent`; common `identity-linking`, `location`, `loyalty`; payment 확장 `ap2-mandates`, `authentication`(device_data_collection, three_ds_challenge), `terms`, `split-payments`. — https://ucp.dev/specification/overview/

### 1.3 Checkout 흐름
- 5개 오퍼레이션. REST 바인딩: `POST /checkout-sessions`, `GET /checkout-sessions/{id}`, `PUT /checkout-sessions/{id}`(전체 교체), `POST /checkout-sessions/{id}/complete`, `POST /checkout-sessions/{id}/cancel`. OpenAPI operationId: create_checkout/get_checkout/update_checkout/complete_checkout/cancel_checkout. — https://ucp.dev/specification/shopping/checkout/rest/ , https://ucp.dev/2026-08-25/services/shopping/rest.openapi.json
- MCP 바인딩 툴명: `create_checkout`, `get_checkout`, `update_checkout`, `complete_checkout`, `cancel_checkout`. 요청 `params.arguments.meta`에 `{"ucp-agent":{"profile":"https://..."},"idempotency-key":"..."}` 필수. 응답은 `result.structuredContent`에 checkout 객체. — https://ucp.dev/specification/shopping/checkout/mcp/
- 필수 헤더(REST): `UCP-Agent: profile="https://platform.example/.well-known/ucp"` (RFC 8941 Dictionary), `Idempotency-Key`, `Request-Id`. 선택: `Authorization`, `X-API-Key`, `Signature`, `Signature-Input`. — https://ucp.dev/specification/shopping/checkout/rest/
- Create 요청 최소 예: `{"line_items":[{"item":{"id":"item_123"},"quantity":2}]}` → 201 + checkout 객체. — 같은 페이지
- Checkout 스키마(`https://ucp.dev/2026-08-25/schemas/shopping/checkout.json`, 직접 다운로드해 확인): required `ucp,id,line_items,status,currency,totals,links`; `additionalProperties: true`. 속성: `id`, `line_items[]`, `buyer`, `context`, `signals`, `attribution`, `status`(enum `incomplete|requires_escalation|ready_for_complete|complete_in_progress|completed|canceled`), `currency`(ISO 4217), `totals`, `actions`, `messages[]`, `links[]`, `policies[]`, `expires_at`(RFC 3339, 기본 TTL 6h), `continue_url`, `payment`, `order`(completed일 때).
- line_item 스키마 required `id,item,quantity,totals`; `quantity`는 정수 step count; `parent_id` 선택. — https://ucp.dev/2026-08-25/schemas/shopping/types/line_item.json
- item 스키마 required `id,title,price`; 선택 `quantity_unit`, `unit_price`, `image_url`. **상품 카테고리 필드는 없음** (스키마 및 스펙 페이지 모두). — https://ucp.dev/2026-08-25/schemas/shopping/types/item.json , https://ucp.dev/specification/shopping/checkout/
- totals: `{type, amount}` 배열, type enum에 `subtotal, tax, fulfillment, discount, total` 포함; amount는 minor units. — https://ucp.dev/specification/shopping/checkout/
- `signals`: `dev.ucp.buyer_ip`, `dev.ucp.user_agent` (남용 방지용). — https://ucp.dev/2026-08-25/schemas/common/types/signals.json
- messages: `type(error|warning|info)`, `code`, `severity(recoverable|requires_buyer_input|requires_buyer_review|unrecoverable)`, `path`(RFC 9535 JSONPath), `content`. — https://ucp.dev/specification/shopping/checkout/
- Complete 요청 바디는 OpenAPI상 `#/components/schemas/checkout` 참조(별도 complete 스키마 없음); 결제 자격증명은 `payment.instruments[]`에 실어 보냄. — https://ucp.dev/2026-08-25/services/shopping/rest.openapi.json , https://ucp.dev/specification/payment/extensions/ap2-mandates/

### 1.4 Payment handler 모델
- 프로필 `payment_handlers`에 reverse-DNS 키(예 `com.example.processor_tokenizer`, `dev.shopify.shop_pay`)로 선언. 항목 필드: `id`, `version`, `spec`, `schema`, `available_instruments[{type, constraints}]`, `config`. — https://ucp.dev/specification/overview/ , https://ucp.dev/specification/payment/guide/
- 템플릿 페이지가 커스텀 핸들러 정의 절차 제공: `{reverse-dns.name}`, `YYYY-MM-DD` 버전, `business_config`/`platform_config`/`response_config`, `available_instruments`, 처리 흐름(검증·멱등성). 제3자 발행 금지 문구 없음 → **커스텀 핸들러 허용(스펙/스키마 URL 자체 호스팅)**. — https://ucp.dev/specification/payment/template/
- `payment` 스키마: `instruments[]` (selected_payment_instrument). instrument required `id, handler_id, type`; 선택 `billing_address`, `credential`, `display`. — https://ucp.dev/2026-08-25/schemas/common/types/payment.json , https://ucp.dev/2026-08-25/schemas/common/types/payment_instrument.json
- `payment_credential` 스키마: required `type`만, `additionalProperties: true` ("Handlers define specific credential types"). — https://ucp.dev/2026-08-25/schemas/common/types/payment_credential.json
- 클라이언트 제출 예:
  ```json
  {"id":"instrument_id","handler_id":"processor_tokenizer_1234","type":"card","credential":{"type":"tokenizer_card_token","token":"...","expiry":"..."},"billing_address":{}}
  ```
  — https://ucp.dev/specification/payment/guide/
- 공식 예시 핸들러: processor-tokenizer, platform-tokenizer, encrypted-credential. **공식 문서에 crypto/stablecoin/x402/wallet 언급 없음.** — https://ucp.dev/specification/overview/ , https://ucp.dev/specification/payment/guide/
- 커뮤니티 x402 핸들러: PrestaShop `fdpsprism` 모듈("Prism (x402 Stablecoin)")이 `/.well-known/ucp`의 `payment_handlers`에 등록되고 complete 시 **서명된 x402 PaymentPayload를 credential로 제출**, 서버가 network/asset/recipient/amount 검증 후 정산. Base Sepolia `eip155:84532`, USDC `0x036cbd…`. Finance District 제작(UCP 공식 아님). — https://github.com/Madmin27/prestashop-agentic-commerce
- UQPAY가 "x402 stablecoin platform powered by UCP" 발표(2026-02-08, USDC/USDT/XUSD). 핸들러명·기술 상세 미공개, Google/UCP 공식 승인 언급 없음. — https://www.prnewswire.com/apac/news-releases/uqpay-launches-commercial-grade-x402-stablecoin-platform-powered-by-ucp-302681187.html

### 1.5 에이전트·사용자 신원
- **플랫폼(에이전트 운영자) 신원**: RFC 9421 HTTP Message Signatures. 플랫폼이 요청 서명, 비즈니스가 응답/웹훅 서명. 서명 컴포넌트 `@method @authority @path (@query) content-digest content-type idempotency-key ucp-agent`. 키는 서명자 프로필 `/.well-known/ucp`의 `keys[]`(JWKS)에서 `keyid`로 조회. ES256 필수, ES384/EdDSA 선택. 예: `Signature-Input: sig1=("@method" "@authority" "@path" "ucp-agent" "idempotency-key" "content-digest" "content-type");keyid="platform-2026"`. — https://ucp.dev/specification/signatures/
- **사용자 신원**: Identity Linking = OAuth 2.0 authorization code + PKCE(S256 필수), 메타데이터 `/.well-known/oauth-authorization-server`(RFC 8414), `iss` 필수(RFC 9207), 스코프 예 `dev.ucp.shopping.checkout`, 토큰은 `Authorization: Bearer`. "agent-authenticated → user-authenticated access를 잇는 다리". **위임·지출한도·만다테 언급 없음.** — https://ucp.dev/specification/common/identity-linking/
- **AP2와의 관계**: UCP 결제 확장 `dev.ucp.common.payment.ap2_mandate`. 체크아웃 응답에 `ap2.merchant_authorization`(비즈니스가 `ap2` 필드 제외한 응답을 JCS 정규화 후 ES256/384/512 detached JWS `<header>..<sig>`로 서명), complete 요청에 `ap2.checkout_mandate`(SD-JWT+kb) + `payment.instruments[].credential.token`에 payment_mandate. 서명 주체는 신뢰 플랫폼(서버) 또는 사용자 디지털 결제 자격증명. AP2 협상 후에는 비-AP2로 되돌리기 금지. 스펙 개요에 "Scenario C: Autonomous Agent (AP2)" 시나리오 존재. — https://ucp.dev/specification/payment/extensions/ap2-mandates/ , https://ucp.dev/specification/overview/
- AP2 v0.2 스펙(2026-04-28 릴리스): "AP2 is designed explicitly to be compatible with the Universal Commerce Protocol (UCP)". Checkout Mandate / Payment Mandate 각각 open(제약)·closed(확정) 단계. **Human Not Present 모드: 사용자가 서명한 open Mandate에 에이전트 공개키를 `cnf` claim으로 넣고, 에이전트 키로 closed Mandate 서명; 검증자에게 open+closed 둘 다 제출; SD-JWT 사용.** 결제 수단은 `type` 필드로 확장 가능. — https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/specification.md , https://github.com/google-agentic-commerce/AP2/releases

### 1.6 참조 구현·SDK
- `@ucp-js/sdk` 최신 0.5.1 (2026-09-02, npm registry). Zod 스키마 + TS 타입만 제공(REST 클라이언트/서버 헬퍼 없음). 0.5.x ↔ 스펙 `2026-08-25`. — https://registry.npmjs.org/@ucp-js/sdk , https://github.com/Universal-Commerce-Protocol/js-sdk
- `python-sdk` 저장소 존재(버전 미확인). — https://github.com/Universal-Commerce-Protocol/python-sdk
- samples: `rest/python/server`(FastAPI), `rest/python/client`, `rest/nodejs`(Hono+Zod), `a2a/business_agent`(ADK+Gemini). x402/크립토 핸들러 없음. — https://github.com/Universal-Commerce-Protocol/samples
- conformance 테스트, ucp-schema 검증기 존재. — https://github.com/Universal-Commerce-Protocol/conformance , https://github.com/universal-commerce-protocol/ucp-schema

---

## 2. x402 (Coinbase → x402 Foundation)

### 2.1 버전·저장소·헤더
- 정본 저장소는 `x402-foundation/x402`(6.6k★); `coinbase/x402`는 그 fork로 표시됨(GitHub API `fork: true, parent: x402-foundation/x402`). 둘 다 2026-09-18 push. — https://api.github.com/repos/coinbase/x402
- 스펙 버전 이력: v0.1 2025-08-29, v0.2 2025-10-03(transport-agnostic), **v2.0 2025-12-09**(CAIP-2, PaymentPayload/Required 재구성, ResourceInfo 분리, extensions). — https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md
- V2 런치 블로그: 헤더를 `PAYMENT-REQUIRED / PAYMENT-SIGNATURE / PAYMENT-RESPONSE`로 교체, 멀티체인 기본, Extensions 공식화, `@x402/*` 패키지 이관, 멀티 facilitator, `SIGN-IN-WITH-X`(CAIP-122) 후속 예고, "reference SDKs are fully backward-compatible with V1". 블로그 게시일은 미확인(fetch 결과 불일치). — https://www.x402.org/writing/x402-v2-launch
- v1 헤더: `X-PAYMENT`, `X-PAYMENT-RESPONSE`; v1 PaymentRequirements는 `maxAmountRequired`, 네트워크명 `base-sepolia` 등. — https://github.com/coinbase/x402/blob/main/specs/x402-specification-v1.md
- v2 HTTP transport: 402 + `PAYMENT-REQUIRED`(base64 PaymentRequired) → 클라이언트 `PAYMENT-SIGNATURE`(base64 PaymentPayload) → 서버 `PAYMENT-RESPONSE`(base64 SettlementResponse). "All x402 protocol information is communicated through headers". transports-v2에 `http.md`, `mcp.md`, `a2a.md`. — https://github.com/coinbase/x402/blob/main/specs/transports-v2/http.md

### 2.2 데이터 객체 (v2)
- PaymentRequired: `x402Version:2`, `error?`, `resource{url, description?, mimeType?}`, `accepts[]`, `extensions?`.
- PaymentRequirements: `scheme`(예 `exact`), `network`(CAIP-2, 예 `eip155:84532`, `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`), `amount`(atomic units 문자열), `asset`(토큰 주소 또는 ISO 4217), `payTo`, `maxTimeoutSeconds`, `extra?`(exact-EVM은 `{name:"USDC", version:"2"}`). v1의 `maxAmountRequired`/`resource`/`description`은 v2에서 `amount`와 상위 `resource` 객체로 이동.
- PaymentPayload: `x402Version:2`, `resource?`, `accepted`(선택한 PaymentRequirements 복사), `payload`(scheme별; exact-EVM은 `{signature, authorization{from,to,value,validAfter,validBefore,nonce}}`), `extensions?`.
- SettlementResponse: `success`, `errorReason?`, `payer?`, `transaction`, `network`, `amount?`, `extensions?`.
- — https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md

### 2.3 Extensions 메커니즘
- `extensions`는 key-value map. 각 값은 `{info: object(필수), schema: JSON Schema(필수)}`. "Servers advertise supported extensions in PaymentRequired, and clients echo them in PaymentPayload. The client must include at least the info received; it may append additional info but cannot delete or overwrite existing info." — https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md (§5.1)
- facilitator `GET /supported` 응답에 `extensions: string[]`(구현한 확장 ID 목록). — 같은 문서 §7.3
- 공식 확장 스펙 목록(`specs/extensions/`): `bazaar.md`(리소스 디스커버리, key `bazaar`, info.input type http|mcp), `eip2612_gas_sponsoring.md`, `erc20_gas_sponsoring.md`, `extension-offer-and-receipt.md`(key `offer-receipt`), `http-message-signatures.md`, `payment_identifier.md`, `sign-in-with-x.md`(key `sign-in-with-x`, `SIGN-IN-WITH-X` 헤더, CAIP-122, 지갑 소유 증명·기결제 스킵; 위임/한도 없음). **agent identity / KYA / delegation / spend-limit 공식 확장은 없음.** — https://github.com/coinbase/x402/tree/main/specs/extensions , https://github.com/coinbase/x402/blob/main/specs/extensions/sign-in-with-x.md
- 스펙 §10.2: SIWE 등 인증 연동으로 "authenticated pricing" 가능하다고만 언급. §12 말미: "budget management, correlation tracking, session handling"은 application notes로 미룸. — https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md
- x402 Foundation `wg-identity` 저장소 존재하나 README가 템플릿 수준(목표 "xxxx"), 격주 미팅만 명시. 이슈 #27에 Hardware-Attested Agent Identity strawman. — https://github.com/x402-foundation/wg-identity , https://github.com/x402-foundation/wg-identity/issues/27
- 비공식 제안: IETF 개인 초안 `draft-vauban-x402-delegation-binding`(2026-05-24, Vauban Research): `DelegationGrant`(별도 FSM 초안에 정의)에 `delegate_pseudonym`, `cap_per_tx`, `cap_per_period`, `period_seconds`, `allowed_merchants`, `allowed_currencies`, `delegation_nonce`, `max_chain_length` 추가, PaymentIntent가 `grant_hash`로 참조. x402 코어 아님. — https://datatracker.ietf.org/doc/html/draft-vauban-x402-delegation-binding-00
- 상용/커뮤니티: Nevermined "x402 Delegation Extension"(`DelegationConfig{spendingLimitCents, durationSecs}`), KYAPay(JWT KYA 토큰) 등 — 표준 아님. — https://nevermined.ai/docs/specs/x402-card-delegation , https://eco.com/support/en/articles/14846277-know-your-agent-kya-identity-for-agent-payments

### 2.4 Facilitator API·공개 facilitator
- `POST /verify` 요청 `{x402Version, paymentPayload, paymentRequirements}` → `{isValid:true, payer}` / `{isValid:false, invalidReason, payer?}`. `POST /settle` 같은 요청 → `{success, payer, transaction, network}`. `GET /supported` → `{kinds:[{x402Version, scheme, network, extra?}], extensions:[], signers:{"eip155:*":[...],...}}`. 스펙 문구: "allows resource servers to delegate blockchain operations to trusted third parties or host the endpoints themselves". — https://github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md §7
- 테스트넷 facilitator `https://x402.org/facilitator` 실측(2026-09-19, `/supported`): v2 `exact/upto/batch-settlement@eip155:84532`, `exact@solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`, algorand/aptos/stellar:testnet/hedera:testnet/xrpl:1; v1 `exact@base-sepolia`, `exact@solana-devnet`. extensions `["builder-code","eip2612GasSponsoring","erc20ApprovalGasSponsoring"]`. API 키 불필요, 개발/테스트넷 용도. — https://x402.org/facilitator/supported , https://docs.x402.org/core-concepts/facilitator
- CDP facilitator: 네트워크 `eip155:8453`(Base), `eip155:84532`, `eip155:137`, `eip155:42161`, `eip155:480`, `eip155:4801`, `solana:5eykt4…`, `solana:EtWTRA…`. 자산: EVM ERC-20(EIP-3009 또는 Permit2), SPL. scheme EVM `exact, upto, batch-settlement`, Solana `exact, upto`. 월 1,000건 무료 후 $0.001/건. CDP API 키 필요(`/supported` 무인증 호출 시 "Unauthorized" 실측). — https://docs.cdp.coinbase.com/x402/network-support
- 기타 공개 facilitator 목록(PayAI, Dexter, Mogami, Polygon, Stellar, Celo, Fireblocks 등). — https://docs.x402.org/dev-tools/facilitators

### 2.5 셀프호스팅·settle 동작
- 공식 예제 `examples/typescript/facilitator/basic`: Express + `x402Facilitator`(`@x402/core/facilitator`) + `ExactEvmScheme`/`UptoEvmScheme`(`@x402/evm/.../facilitator`) + `ExactSvmScheme`(`@x402/svm`). env `EVM_PRIVATE_KEY`, `SVM_PRIVATE_KEY`, `PORT`(기본 4022). Base Sepolia 가스용 ETH 필요. 라이프사이클 훅 `onBeforeVerify/onAfterVerify/onVerifyFailure/onBeforeSettle/onAfterSettle/onSettleFailure`. `/verify /settle /supported` 제공 → **셀프호스팅 가능**. 같은 저장소에 `servers/self-facilitation`(인프로세스) 예제도 있음. — https://github.com/coinbase/x402/tree/main/examples/typescript/facilitator/basic , https://github.com/x402-foundation/x402/tree/main/examples/typescript/servers/self-facilitation
- exact-EVM settle: 클라이언트가 EIP-712로 서명한 EIP-3009 `transferWithAuthorization(from,to,value,validAfter,validBefore,nonce)`를 facilitator가 온체인 제출하며 가스 부담. EIP-3009 미지원 토큰은 Permit2 프록시 `x402ExactPermit2Proxy`(0x402085c248EeA27D92E8b30b2C58ed07f9E20001). 검증: 서명 복구, 잔액, 요구조건 일치, 토큰/네트워크 일치, 시뮬레이션. — https://github.com/coinbase/x402/blob/main/specs/schemes/exact/scheme_exact_evm.md

### 2.6 npm 패키지 (registry.npmjs.org, 2026-09-19 조회)
- `@x402/core`, `@x402/fetch`, `@x402/express`, `@x402/hono`, `@x402/evm`, `@x402/svm`, `@x402/extensions`: 모두 **2.26.0** (2026-09-15). 기타 `@x402/axios`, `@x402/fastify`, `@x402/next`, `@x402/paywall`, `@x402/stellar`, `@x402/mcp`. — https://registry.npmjs.org/@x402/core , https://github.com/coinbase/x402
- `x402`(legacy v1 SDK): 1.2.0 (2026-04-16). `@coinbase/x402`(CDP facilitator 클라이언트): 2.1.0 (2025-12-23). `@x402/facilitator` 패키지는 없음(dist-tags 비어 있음). — https://registry.npmjs.org/x402 , https://registry.npmjs.org/@coinbase/x402
- Python: `pip install x402`. — https://github.com/coinbase/x402

### 2.7 x402 ↔ AP2 ↔ UCP 연결 현황
- AP2 저장소 샘플 `a2a/human-present/x402`, `a2a/human-not-present/x402` 존재. README 문구: "**The AP2 compatible x402 extension is coming soon.** The current x402 extension will be enhanced to ensure the creation of all key mandates outlined in AP2." — https://github.com/google-agentic-commerce/AP2/tree/main/code/samples/python/scenarios/a2a/human-present/x402
- `google-agentic-commerce/a2a-x402`: A2A용 x402 확장, 최신 릴리스 v0.1.0(2025-09-16), 마지막 push 2026-08-04, 아카이브 아님. 메시지 단계 payment-required → payment-submitted → payment-completed. — https://github.com/google-agentic-commerce/a2a-x402
- ap2-protocol.org: "AP2 is available as an extension for the open-source A2A protocol and Universal Commerce Protocol". — https://ap2-protocol.org/
- x402 스펙/확장/런치 글 어디에도 UCP·AP2 언급 없음(위 조사 범위). UCP 공식 문서에도 x402 언급 없음. **공식 x402↔UCP 브리지는 미확인(없음으로 판단)**; 커뮤니티 구현(Prism 핸들러, UQPAY)만 존재.

---

## 3. 설계에 영향을 주는 사실 (위임 자격증명을 UCP 체크아웃의 x402 결제에 꽂을 때)

1. **UCP는 결제 핸들러를 reverse-DNS 커스텀으로 열어두고, `payment_credential`이 `type` 외 `additionalProperties: true`** 다. 즉 `com.kya.x402` 같은 핸들러를 `/.well-known/ucp`의 `payment_handlers`에 선언하고 complete 요청의 `payment.instruments[].credential`에 x402 PaymentPayload + 위임 자격증명을 그대로 실을 수 있다(Prism 핸들러가 이미 이 패턴을 씀). 공식 x402 핸들러는 없으므로 우리가 스펙/스키마 URL을 호스팅해야 한다.
2. **x402 v2의 `extensions` map은 서버가 `{info, schema}`로 광고하고 클라이언트가 echo(추가만 가능, 삭제·덮어쓰기 금지)** 하는 구조다. 위임 자격증명(principal, agent 키, 한도, 만료)을 `PaymentRequired.extensions["kya-delegation"]`로 요구하고 `PaymentPayload.extensions`로 회신받는 것이 스펙에 맞는 삽입점이며, facilitator `/supported.extensions`에 이름을 올리면 된다. 공식 identity/KYA/delegation 확장은 없다 → 우리 정의가 곧 첫 제안.
3. **facilitator는 오픈소스로 셀프호스팅 가능**(`x402Facilitator` + `ExactEvmScheme`, `onBeforeVerify`/`onBeforeSettle` 훅). 한도·위임 검증을 이 훅에서 수행하면 verify 단계에서 거절할 수 있다. 데모는 `eip155:84532`(Base Sepolia) USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`로, 공개 facilitator `https://x402.org/facilitator`도 키 없이 쓸 수 있다.
4. **x402 결제 자체는 EIP-3009 `transferWithAuthorization`으로 `from`(지갑)이 서명**한다. 즉 온체인 payer는 에이전트 지갑이고, "누구를 대신해서"는 오프체인 자격증명으로만 표현된다. 위임 자격증명은 반드시 `authorization.from` 주소(또는 그 키)에 바인딩해야 재사용·탈취를 막는다(IETF 초안의 `delegate_pseudonym`, AP2의 `cnf` claim과 같은 아이디어).
5. **AP2 v0.2가 이미 "Human Not Present" 모델을 정의**한다: 사용자가 서명한 open Mandate(제약 포함, 에이전트 공개키 `cnf`, 짧은 `exp`) + 에이전트가 서명한 closed Mandate, SD-JWT 포맷. UCP에는 `dev.ucp.common.payment.ap2_mandate` 확장이 있어 `ap2.checkout_mandate`와 `payment.instruments[].credential.token`에 실린다. 우리 자격증명을 AP2 open Payment Mandate와 호환되게(SD-JWT, `cnf`, 한도 claim) 설계하면 UCP 쪽 삽입점이 이미 존재한다. 다만 AP2 호환 x402 확장은 "coming soon" 상태라 x402 쪽 매핑은 우리가 채워야 한다.
6. **에이전트 운영자 신원은 UCP에서 RFC 9421 HTTP Message Signatures + `UCP-Agent: profile="…/.well-known/ucp"` + JWKS `keys[]`**로 확인된다. 사용자 신원은 OAuth Identity Linking(Bearer 토큰)이며 지출한도 개념은 없다. 위임 자격증명의 issuer(principal)·subject(agent) 키를 UCP JWKS/`UCP-Agent` 프로필과 연결하면 "누가 서명했는가"를 머천트가 검증할 수 있다.
7. **UCP checkout에는 상품 카테고리 필드가 없다.** 카테고리 기반 정책(예: "식료품만 허용")은 우리가 `item.id`/`title` 매핑 또는 handler `config`로 보완해야 하며, 금액 정책은 `totals[type=total].amount`(minor units)와 `currency`를 그대로 쓸 수 있다. 한도는 x402 `amount`(atomic units, USDC 6자리)와 UCP minor units(센트)의 단위 변환이 필요하다.
8. **SDK 현황**: `@x402/*` 2.26.0(v1 하위호환), `@ucp-js/sdk` 0.5.1(Zod 타입만, 서버 없음) → UCP 머천트 서버는 samples `rest/nodejs`(Hono)를 베이스로 쓰는 것이 가장 빠르고, x402 미들웨어도 `@x402/hono`가 있어 스택이 맞는다.
