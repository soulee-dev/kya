#!/usr/bin/env bash
# 데모 4장면을 mock 모드 Verifier에 curl로 통과시킨다.
# A 3 USDC 승인 → B 8 USDC 거절(1회 한도) → C 4 USDC 승인 → C 4 USDC 거절(누적 한도)
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-4010}"
TMP="$(mktemp -d)"
URL="http://localhost:$PORT"

pnpm exec tsx scripts/make-fixture.ts "$TMP/fx" >/dev/null
JTI="$(cat "$TMP/fx/jti")"

TSX="$(pnpm bin)/tsx"
PORT=$PORT KYA_SETTLE_MODE=mock DID_DOC_OVERRIDE="$TMP/fx/did.json" DATA_DIR="$TMP/data" \
  "$TSX" src/index.ts >"$TMP/verifier.log" 2>&1 &
PID=$!
cleanup() { kill "$PID" 2>/dev/null || true; lsof -ti ":$PORT" 2>/dev/null | xargs kill 2>/dev/null || true; }
trap cleanup EXIT
for _ in $(seq 1 50); do curl -sf "$URL/" >/dev/null 2>&1 && break; sleep 0.2; done

post() { curl -s -X POST "$URL/$1" -H 'content-type: application/json' --data-binary @"$TMP/fx/$2"; }
expect() { # expect <label> <json> <substring>
  if [[ "$2" == *"$3"* ]]; then echo "✔ $1: $2"; else echo "✘ $1: expected '$3' in $2"; exit 1; fi
}

echo "== GET /supported"
expect "supported advertises kya" "$(curl -s "$URL/supported")" '"kya"'

echo "== 장면 0: delegation 없음"
expect "missing"        "$(post verify no-delegation.json)" 'kya:missing_delegation'
echo "== 장면 A: 3 USDC"
expect "A verify"       "$(post verify A-3.json)"  '"isValid":true'
expect "A settle"       "$(post settle A-3.json)"  '"success":true'
echo "== 장면 B: 8 USDC (1회 한도 5)"
expect "B verify"       "$(post verify B-8.json)"  'kya:per_tx_limit_exceeded'
echo "== 장면 C: 4 USDC"
expect "C verify"       "$(post verify C-4.json)"  '"isValid":true'
expect "C settle"       "$(post settle C-4.json)"  '"success":true'
echo "== 장면 C': 4 USDC 다시 (누적 7+4 > 10)"
expect "C' verify"      "$(post verify C-4.json)"  'kya:cumulative_limit_exceeded'
expect "C' settle"      "$(post settle C-4.json)"  'kya:cumulative_limit_exceeded'

echo "== ledger / decisions"
expect "ledger spent 7" "$(curl -s "$URL/ledger/$JTI")" '"spent":"7000000"'
DEC="$(curl -s "$URL/decisions?limit=3")"
expect "latest decision" "$DEC" '"reason":"kya:cumulative_limit_exceeded"'
expect "principal on card" "$DEC" '"name":"Acme Corp"'
echo
echo "모든 장면 통과. 로그: $TMP/verifier.log"
