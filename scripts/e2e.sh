#!/usr/bin/env bash
# 웹(발급, Next.js) + Verifier(검사)를 함께 띄우고, 웹이 발급한 JWT로 데모 4장면을 돌린다.
# Verifier는 JWT의 iss(did:web:localhost%3A<port>)를 웹의 /.well-known/did.json 으로 실제 조회한다.
set -euo pipefail
cd "$(dirname "$0")/.."
WP="${WEB_PORT:-3021}"; VP="${VERIFIER_PORT:-3020}"
TMP="$(mktemp -d)"
W="http://localhost:$WP"; V="http://localhost:$VP"
AGENT="0x1111111111111111111111111111111111111111"
MERCHANT="0x2222222222222222222222222222222222222222"

TSX="$(cd apps/verifier && pnpm bin)/tsx"
(cd apps/web && exec env WEB_DEMO_MODE=true PUBLIC_HOST="localhost:$WP" KYA_DATA_DIR="$TMP/w" KYA_NEXT_DIST_DIR=".next-test" \
  VERIFIER_URL="$V" MERCHANT_PAYTO="$MERCHANT" pnpm exec next dev --port "$WP" >"$TMP/web.log" 2>&1) &
PID1=$!
(cd apps/verifier && exec env PORT=$VP KYA_SETTLE_MODE=mock DATA_DIR="$TMP/v" "$TSX" src/index.ts >"$TMP/verifier.log" 2>&1) &
PID2=$!
cleanup() { kill "$PID1" "$PID2" 2>/dev/null || true; wait "$PID1" "$PID2" 2>/dev/null || true; lsof -ti ":$WP" -ti ":$VP" 2>/dev/null | xargs kill 2>/dev/null || true; }
trap cleanup EXIT
for _ in $(seq 1 240); do curl -sf "$W/api/state" >/dev/null 2>&1 && curl -sf "$V/" >/dev/null 2>&1 && break; sleep 0.5; done
curl -sf "$W/api/state" >/dev/null || { echo "✘ 웹이 뜨지 않음"; tail -20 "$TMP/web.log"; exit 1; }

j() { node -e 'const o=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(process.argv[1].split(".").reduce((a,k)=>a?.[k],o)??"")' "$1"; }
expect() { if [[ "$2" == *"$3"* ]]; then echo "✔ $1"; else echo "✘ $1: expected '$3' in $2"; exit 1; fi; }
post() { curl -s -X POST "$1" -H 'content-type: application/json' -d "$2"; }

PR="$(post "$W/api/principals" '{"entityType":"business","name":"Acme Labs","registrationNumber":"123-45-67890"}')"
PID_="$(echo "$PR" | j principalId)"
expect "principal did" "$PR" '"did":"did:web:localhost%3A'"$WP"':principals:'
SBID="$(post "$W/api/sandboxes" '{}' | j sandboxId)"
expect "register (계약 경로 /agents/register)" "$(post "$W/agents/register" '{"sandboxId":"'"$SBID"'","address":"'"$AGENT"'"}')" '"address"'
ISSUE_BODY='{"principalId":"'"$PID_"'","address":"'"$AGENT"'","scope":{"network":"eip155:84532","asset":"0x036CbD53842c5426634e7929541eC2318f3dCF7e","perTxLimit":"5000000","cumulativeLimit":"10000000","merchants":["'"$MERCHANT"'"]}}'
D="$(post "$W/api/delegations" "$ISSUE_BODY")"
JWT="$(echo "$D" | j delegation)"; JTI="$(echo "$D" | j jti)"
[[ -n "$JWT" ]] || { echo "✘ 발급 실패: $D"; exit 1; }
echo "✔ 발급 (iss → $W/.well-known/did.json)"
expect "polling GET /agents/:address/delegation" "$(curl -s "$W/agents/$AGENT/delegation")" "$JWT"

req() { # req <amount>
  node -e '
const [amount, jwt, agent, merchant, v] = process.argv.slice(1);
const r = { scheme:"exact", network:"eip155:84532", amount, asset:"0x036CbD53842c5426634e7929541eC2318f3dCF7e", payTo: merchant, maxTimeoutSeconds:60, extra:{name:"USDC",version:"2"} };
console.log(JSON.stringify({ x402Version:2, paymentRequirements:r, paymentPayload:{ x402Version:2, accepted:r,
  payload:{ signature:"0xsig", authorization:{ from:agent, to:merchant, value:amount, validAfter:"0", validBefore:"9999999999", nonce:"0x01" } },
  extensions:{ kya:{ info:{ verifier:v, required:true, delegation:jwt }, schema:{ type:"object", properties:{ delegation:{ type:"string" } } } } } } }));' "$1" "$JWT" "$AGENT" "$MERCHANT" "$V"
}
call() { post "$V/$1" "$(req "$2")"; }

expect "A 3 verify"    "$(call verify 3000000)" '"isValid":true'
expect "A 3 settle"    "$(call settle 3000000)" '"success":true'
expect "B 8 denied"    "$(call verify 8000000)" 'kya:per_tx_limit_exceeded'
expect "C 4 verify"    "$(call verify 4000000)" '"isValid":true'
expect "C 4 settle"    "$(call settle 4000000)" '"success":true'
expect "C 4 again"     "$(call verify 4000000)" 'kya:cumulative_limit_exceeded'
expect "ledger"        "$(curl -s "$V/ledger/$JTI")" '"spent":"7000000"'
expect "decision card" "$(curl -s "$V/decisions?limit=1")" '"name":"Acme Labs"'
expect "웹 프록시 /api/verifier/ledger"    "$(curl -s "$W/api/verifier/ledger/$JTI")" '"spent":"7000000"'
expect "웹 프록시 /api/verifier/decisions" "$(curl -s "$W/api/verifier/decisions?limit=1")" '"name":"Acme Labs"'
echo; echo "e2e 통과. 로그: $TMP"
