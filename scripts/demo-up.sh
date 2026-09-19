#!/usr/bin/env bash
# 데모 서버 세 개를 한 번에 띄운다. 로그는 .logs/*.log
set -e
cd "$(dirname "$0")/.."
mkdir -p .logs
pkill -f "@kya/verifier dev" 2>/dev/null || true
pkill -f "kya-merchant" 2>/dev/null || true
pkill -f "next dev --port 3000" 2>/dev/null || true
sleep 1
( set -a; . apps/verifier/.env; set +a; pnpm --filter @kya/verifier dev ) > .logs/verifier.log 2>&1 &
( set -a; . apps/merchant/.env; set +a; pnpm --filter kya-merchant dev ) > .logs/merchant.log 2>&1 &
( pnpm --filter @kya/web dev ) > .logs/web.log 2>&1 &
sleep 6
echo "verifier :4000 -> $(curl -s -o /dev/null -w '%{http_code}' localhost:4000/supported)"
echo "merchant :5050 -> $(curl -s -o /dev/null -w '%{http_code}' localhost:5050/products)"
echo "web      :3000 -> $(curl -s -o /dev/null -w '%{http_code}' localhost:3000/.well-known/did.json)"
echo "로그: tail -f .logs/verifier.log .logs/merchant.log .logs/web.log"
