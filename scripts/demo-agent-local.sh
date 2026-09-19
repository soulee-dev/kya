#!/usr/bin/env bash
# 샌드박스 없이 노트북에서 러너를 돌린다 (실패 대비). 루트 .env를 읽되 URL만 localhost로 바꾼다.
# web 은 자기가 만든 샌드박스 id 로 온 register 만 받으므로, /api/state 에서 그 id 를 읽어 넘긴다.
# (WEB_DEMO_MODE=true 로 web 을 띄우고 화면에서 "샌드박스 생성하기"를 먼저 누른다.)
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
SANDBOX_ID="$(curl -sf http://localhost:3000/api/state | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).sandbox?.sandboxId??""))')"
[[ -n "$SANDBOX_ID" ]] || { echo "web 에 샌드박스가 없습니다. 화면에서 '샌드박스 생성하기'를 먼저 누르세요."; exit 1; }
echo "sandboxId=$SANDBOX_ID"
export KYA_URL=http://localhost:3000 MERCHANT_URL=http://localhost:5050 SANDBOX_ID
pnpm --filter kya-agent start
