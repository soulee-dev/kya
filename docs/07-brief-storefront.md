# 브리프: Merchant 스토어프론트 (`apps/merchant/public/index.html`)

**건드릴 파일: `apps/merchant/public/` 아래만.** `src/`는 다른 세션이 만든다. 정적 HTML 1장(+ 필요하면 css/js 파일)에 Tailwind CDN 등 CDN만 사용. 빌드 없음.
실행: `cd apps/merchant && MERCHANT_PAYTO=0x1111111111111111111111111111111111111111 npx tsx src/index.ts` → http://localhost:5050 (API도 같은 origin). 목업 Verifier: `npx tsx scripts/mock-facilitator.ts` (4000) + `FACILITATOR_URL=http://localhost:4000`.

## 화면이 하는 일
여성 고객 타깃 명품 편집샵. 채팅 한 줄 → 에이전트가 상품을 찾고 추천 → 결제(x402, KYA Verifier 판정) → 결과 카드. **Google Pay 시트 없음.** "결제창"은 `pay` 단계의 판정 카드다.

## API (모두 같은 origin, CORS 열림)

| 호출 | 용도 |
|---|---|
| `GET /products` / `GET /products?q=자켓&limit=12` | 카탈로그 그리드. 항목: `{id, title, brand, priceKRW, priceUSDC, imageUrl, url, category, source}` |
| `POST /commands` body `{ "text": "10만원짜리 자켓 찾아줘" }` → `201 { id, text, status:"queued", events:[] }` | 채팅 전송 |
| `GET /commands/:id` → `{ id, text, status:"queued"\|"running"\|"done", events:[{at, step, message, data?}], result? }` | **1초 폴링**해서 진행 표시 |
| `GET /state` → `{ commands[], checkouts[], decisions[] }` | 전체 대시보드용(선택) |

### `events[].step` 값과 표시 제안
| step | message 예 | data | 표시 |
|---|---|---|---|
| `start` | 에이전트가 요청을 받았어요 | | 말풍선 |
| `think` | 요청 분석 중: "…" | | 로딩 |
| `search` | "트위드 자켓" 검색 중… / 3개 후보 발견 | `{products:[...4개]}` | 후보 상품 미니 카드 |
| `recommend` | 추천 이유 한 문장 | `{product}` | **큰 추천 카드**(이미지, 브랜드, 가격) |
| `checkout` | 체크아웃 생성 co_xxx (1.29 USDC) | `{checkoutId}` | 장바구니 뱃지 |
| `pay` | 결제 서명 → Verifier 검사 중… / 결제 완료 tx… / 결제 거절: kya:per_tx_limit_exceeded | `{ok, reason, tx?}` 또는 Decision | **판정 카드**: 승인(초록)/거절(빨강, 이유 한글화) |
| `verify` / `settle` | ✅ 승인 · verified / ⛔ 거절 · kya:… | Decision `{decision, reason, amount, payer, txHash?}` | 판정 카드 보조 |
| `done` | 고객용 2~3문장 요약 | | 마지막 말풍선 |
| `error` | 에러 메시지 | | 빨간 말풍선 |

거절 코드 → 한글: `kya:per_tx_limit_exceeded` 1회 한도 초과 · `kya:cumulative_limit_exceeded` 누적 한도 초과 · `kya:missing_delegation` 위임 없음 · `kya:invalid_delegation` 위임 만료/위조 · `kya:merchant_not_allowed` 허용되지 않은 상점 · `kya:subject_mismatch` 에이전트 불일치.

`result`: `{ outcome: "purchased"|"denied"|"recommended"|"not_found"|"error", productId?, checkoutId?, message }`.

## 금액 표기
`amount`는 USDC atomic(6자리) 문자열. 데모 환산 1 USDC = 100,000원 → `priceKRW = amount/10`. 화면엔 원화 주로, USDC 보조.

## 데모 대사 예
- "가을에 입을 10만원대 트위드 자켓 하나 골라줘" → 승인
- "80만원짜리 실크 원피스 사줘" → 1회 한도(5 USDC=50만원) 거절
