#!/usr/bin/env bash
# 플랫폼(발급) + Verifier(검사)를 함께 띄우고, 플랫폼이 발급한 JWT로 데모 4장면을 돌린다.
# Verifier는 JWT의 iss(did:web:localhost%3A<port>)를 플랫폼의 /.well-known/did.json 으로 실제 조회한다.
set -euo pipefail
cd "$(dirname "$0")/.."
PP="${PLATFORM_PORT:-4021}"; VP="${VERIFIER_PORT:-4020}"
TMP="$(mktemp -d)"
P="http://localhost:$PP"; V="http://localhost:$VP"
AGENT="0x1111111111111111111111111111111111111111"
MERCHANT="0x2222222222222222222222222222222222222222"

TSX="$(cd apps/verifier && pnpm bin)/tsx"
(cd apps/platform && exec env PORT=$PP PUBLIC_HOST="localhost:$PP" DATA_DIR="$TMP/p" "$TSX" src/index.ts >"$TMP/platform.log" 2>&1) &
PID1=$!
(cd apps/verifier && exec env PORT=$VP KYA_SETTLE_MODE=mock DATA_DIR="$TMP/v" "$TSX" src/index.ts >"$TMP/verifier.log" 2>&1) &
PID2=$!
cleanup() { kill "$PID1" "$PID2" 2>/dev/null || true; lsof -ti ":$PP" -ti ":$VP" 2>/dev/null | xargs kill 2>/dev/null || true; }
trap cleanup EXIT
for _ in $(seq 1 50); do curl -sf "$P/" >/dev/null 2>&1 && curl -sf "$V/" >/dev/null 2>&1 && break; sleep 0.2; done

j() { node -e 'const o=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(process.argv[1].split(".").reduce((a,k)=>a?.[k],o)??"")' "$1"; }
expect() { if [[ "$2" == *"$3"* ]]; then echo "✔ $1"; else echo "✘ $1: expected '$3' in $2"; exit 1; fi; }

PR="$(curl -s -X POST "$P/api/principals" -H 'content-type: application/json' -d '{"entityType":"person","name":"Soul"}')"
PID_="$(echo "$PR" | j principalId)"
REG_BODY='{"sandboxId":"sb-e2e","address":"'"$AGENT"'"}'
curl -s -X POST "$P/agents/register" -H 'content-type: application/json' -d "$REG_BODY" >/dev/null
ISSUE_BODY='{"principalId":"'"$PID_"'","address":"'"$AGENT"'","scope":{"perTxLimit":"5000000","cumulativeLimit":"10000000","merchants":["'"$MERCHANT"'"]}}'
JWT="$(curl -s -X POST "$P/api/delegations" -H 'content-type: application/json' -d "$ISSUE_BODY" | j delegation)"
[[ -n "$JWT" ]] || { echo "✘ 발급 실패"; exit 1; }
echo "✔ 발급 (iss → $P/.well-known/did.json)"

req() { # req <amount>
  node -e '
const [amount, jwt, agent, merchant] = process.argv.slice(1);
const r = { scheme:"exact", network:"eip155:84532", amount, asset:"0x036CbD53842c5426634e7929541eC2318f3dCF7e", payTo: merchant, maxTimeoutSeconds:60, extra:{name:"USDC",version:"2"} };
console.log(JSON.stringify({ x402Version:2, paymentRequirements:r, paymentPayload:{ x402Version:2, accepted:r,
  payload:{ signature:"0xsig", authorization:{ from:agent, to:merchant, value:amount, validAfter:"0", validBefore:"9999999999", nonce:"0x01" } },
  extensions:{ kya:{ info:{ verifier:"'"$V"'", required:true, delegation:jwt }, schema:{ type:"object", properties:{ delegation:{ type:"string" } } } } } } }));' "$1" "$JWT" "$AGENT" "$MERCHANT"
}
call() { curl -s -X POST "$V/$1" -H 'content-type: application/json' -d "$(req "$2")"; }

expect "A 3 verify"    "$(call verify 3000000)" '"isValid":true'
expect "A 3 settle"    "$(call settle 3000000)" '"success":true'
expect "B 8 denied"    "$(call verify 8000000)" 'kya:per_tx_limit_exceeded'
expect "C 4 verify"    "$(call verify 4000000)" '"isValid":true'
expect "C 4 settle"    "$(call settle 4000000)" '"success":true'
expect "C 4 again"     "$(call verify 4000000)" 'kya:cumulative_limit_exceeded'
JTI="$(curl -s "$P/api/state" | j delegation.jti)"
expect "ledger"        "$(curl -s "$V/ledger/$JTI")" '"spent":"7000000"'
expect "decision card" "$(curl -s "$V/decisions?limit=1")" '"name":"Soul"'
echo; echo "e2e 통과. 로그: $TMP"
