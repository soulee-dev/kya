#!/usr/bin/env bash
# 러너 없이 발급 흐름을 돌린다: 신원 확인 → 샌드박스(로컬 id) → register 흉내 → 발급 → did.json으로 JWT 검증.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-4011}"
TMP="$(mktemp -d)"
URL="http://localhost:$PORT"
AGENT="${AGENT:-0x1111111111111111111111111111111111111111}"
MERCHANT="${MERCHANT_PAYTO:-0x2222222222222222222222222222222222222222}"

# TREASURY_PRIVATE_KEY / DAYTONA_API_KEY 가 없으면 충전과 실제 샌드박스는 건너뛴다.
TSX="$(pnpm bin)/tsx"
PORT=$PORT PUBLIC_HOST="localhost:$PORT" DATA_DIR="$TMP/data" "$TSX" src/index.ts >"$TMP/platform.log" 2>&1 &
PID=$!
cleanup() { kill "$PID" 2>/dev/null || true; lsof -ti ":$PORT" 2>/dev/null | xargs kill 2>/dev/null || true; }
trap cleanup EXIT
for _ in $(seq 1 50); do curl -sf "$URL/" >/dev/null 2>&1 && break; sleep 0.2; done

j() { node -e 'const o=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(process.argv[1].split(".").reduce((a,k)=>a?.[k],o)??"")' "$1"; }
expect() { if [[ "$2" == *"$3"* ]]; then echo "✔ $1"; else echo "✘ $1: expected '$3' in $2"; exit 1; fi; }

echo "== 1. 신원 확인 스텁"
P="$(curl -s -X POST "$URL/api/principals" -H 'content-type: application/json' -d '{"entityType":"business","name":"Acme Corp","registrationNumber":"123-45-67890"}')"
expect "principal verified" "$P" '"verifiedAt"'
PID_="$(echo "$P" | j principalId)"

echo "== 2. 샌드박스"
SB="$(curl -s -X POST "$URL/api/sandboxes")"
SBID="$(echo "$SB" | j sandboxId)"; expect "sandbox id" "$SB" '"sandboxId"'

echo "== 3. Agent register (접점 4 경로, /api 없이)"
REG_BODY='{"sandboxId":"'"$SBID"'","address":"'"$AGENT"'"}'
REG="$(curl -s -X POST "$URL/agents/register" -H 'content-type: application/json' -d "$REG_BODY")"
expect "register" "$REG" '"registeredAt"'
CODE="$(curl -s -o /dev/null -w '%{http_code}' "$URL/agents/$AGENT/delegation")"
expect "delegation before issue → 404" "$CODE" '404'

echo "== 4. Delegation 발급"
ISSUE_BODY='{"principalId":"'"$PID_"'","address":"'"$AGENT"'","scope":{"perTxLimit":"5000000","cumulativeLimit":"10000000","merchants":["'"$MERCHANT"'"]}}'
D="$(curl -s -X POST "$URL/api/delegations" -H 'content-type: application/json' -d "$ISSUE_BODY")"
expect "issued" "$D" '"jti"'
JWT="$(echo "$D" | j delegation)"
expect "polling returns JWT" "$(curl -s "$URL/agents/$AGENT/delegation")" "$JWT"

echo "== 5. did.json으로 검증"
pnpm exec tsx scripts/verify-jwt.ts "$JWT" "$URL/.well-known/did.json"

echo "== 6. events / state"
expect "event" "$(curl -s -X POST "$URL/agents/$AGENT/events" -H 'content-type: application/json' -d '{"step":"boot","message":"wallet created"}')" '"at"'
S="$(curl -s "$URL/api/state")"
JTI="$(echo "$D" | j jti)"
expect "state has delegation" "$S" '"jti":"'"$JTI"'"'
expect "state has event" "$S" '"step":"boot"'
echo
echo "발급 흐름 통과. 로그: $TMP/platform.log"
