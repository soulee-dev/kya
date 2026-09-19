#!/usr/bin/env bash
# 샌드박스 없이 노트북에서 러너를 돌린다 (실패 대비). 루트 .env를 읽되 URL만 localhost로 바꾼다.
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
export KYA_URL=http://localhost:3000 MERCHANT_URL=http://localhost:5050 SANDBOX_ID=local-$(date +%s)
pnpm --filter kya-agent start
