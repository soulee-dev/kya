#!/usr/bin/env bash
# 루트 .env 하나로 데모 서버 세 개를 띄운다. 로그는 .logs/*.log
set -e
cd "$(dirname "$0")/.."
mkdir -p .logs
set -a; . ./.env; set +a
pkill -f "@kya/verifier dev" 2>/dev/null || true
pkill -f "kya-merchant" 2>/dev/null || true
pkill -f "next dev --port 3000" 2>/dev/null || true
sleep 1
( PORT=4000 pnpm --filter @kya/verifier dev ) > .logs/verifier.log 2>&1 &
( PORT=5050 pnpm --filter kya-merchant dev ) > .logs/merchant.log 2>&1 &
( pnpm --filter @kya/web dev ) > .logs/web.log 2>&1 &
sleep 6
echo "verifier :4000 -> $(curl -s -o /dev/null -w '%{http_code}' localhost:4000/supported)  (mode=$KYA_SETTLE_MODE)"
echo "merchant :5050 -> $(curl -s -o /dev/null -w '%{http_code}' localhost:5050/products)"
echo "web      :3000 -> $(curl -s -o /dev/null -w '%{http_code}' localhost:3000/.well-known/did.json)"
echo "web tunnel      -> $(curl -s -o /dev/null -w '%{http_code}' $WEB_TUNNEL/.well-known/did.json)  $WEB_TUNNEL"
echo "merchant tunnel -> $(curl -s -o /dev/null -w '%{http_code}' $MERCHANT_TUNNEL/products)  $MERCHANT_TUNNEL"
echo "로그: tail -f .logs/verifier.log .logs/merchant.log .logs/web.log"
