#!/usr/bin/env bash
# 샌드박스 없이 노트북에서 러너를 돌린다 (실패 대비 2번).
cd "$(dirname "$0")/.."
set -a; . apps/agent/.env; set +a
export SANDBOX_ID=local-$(date +%s)
pnpm --filter kya-agent start
