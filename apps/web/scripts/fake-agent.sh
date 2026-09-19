#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export KYA_URL="${KYA_URL:-http://localhost:3000}"
export AGENT_ADDRESS="${AGENT_ADDRESS:-0x1111111111111111111111111111111111111111}"
export MERCHANT_PAYTO="${MERCHANT_PAYTO:-0x2222222222222222222222222222222222222222}"
node --input-type=module <<'JS'
import { execFileSync } from 'node:child_process';
import { importJWK, jwtVerify } from 'jose';
const base = process.env.KYA_URL.replace(/\/$/, '');
function request(path, body) {
  const args = ['--silent', '--show-error', '--fail-with-body', `${base}${path}`];
  if (body !== undefined) args.push('-H', 'Content-Type: application/json', '--data-binary', '@-');
  return JSON.parse(execFileSync('curl', args, { input: body === undefined ? undefined : JSON.stringify(body), encoding: 'utf8' }));
}
let state = request('/api/state');
if (!state.demo) throw new Error('WEB_DEMO_MODE=true인 서버에서 실행해 주세요. 이 스크립트는 실제 충전을 수행하지 않습니다.');
if (!state.principal) request('/api/principals', { entityType: 'business', name: 'Acme Labs', registrationNumber: '123-45-67890' });
if (!state.sandbox) request('/api/sandboxes', {});
state = request('/api/state');
const address = state.agent?.address || process.env.AGENT_ADDRESS;
request('/agents/register', { sandboxId: state.sandbox.sandboxId, address });
request(`/agents/${address}/events`, { step: 'ready', message: 'Fake Agent 연결 완료 · 서명된 위임을 기다립니다.' });
if (process.env.ISSUE_DELEGATION !== '1') {
  console.log(`Agent 등록 완료: ${address}\n${base} 에서 Scope 입력 후 위임을 발급하세요.\n자동 발급 및 JWT 검증: ISSUE_DELEGATION=1 bash scripts/fake-agent.sh`);
  process.exit(0);
}
const result = request('/api/delegations', { principalId: state.principal.principalId, address, scope: {
  network: 'eip155:84532', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  perTxLimit: '5000000', cumulativeLimit: '10000000', merchants: [process.env.MERCHANT_PAYTO],
} });
const document = request('/.well-known/did.json');
const key = await importJWK(document.verificationMethod[0].publicKeyJwk, 'EdDSA');
const { payload } = await jwtVerify(result.delegation, key, { algorithms: ['EdDSA'], issuer: state.principal.did, subject: `did:pkh:eip155:84532:${address}` });
const polled = request(`/agents/${address}/delegation`);
if (polled.delegation !== result.delegation) throw new Error('Agent 폴링 JWT가 발급 JWT와 다릅니다.');
console.log(`JWT 서명·issuer·subject·만료 검증 통과\njti: ${payload.jti}\n실제 충전 없음 (로컬 데모)`);
JS
