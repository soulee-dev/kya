/**
 * 시나리오용 픽스처 생성: 키 쌍 → did.json → Delegation JWT → 4개 facilitator 요청 본문.
 * 사용: tsx scripts/make-fixture.ts <outDir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildDidDocument, generatePrincipalKey, issueDelegation, toSigner, USDC_ASSET, type FacilitatorRequest } from "@kya/core";

const out = process.argv[2] ?? "fixtures";
mkdirSync(out, { recursive: true });

const AGENT = "0x1111111111111111111111111111111111111111";
const MERCHANT = process.env.MERCHANT_PAYTO ?? "0x2222222222222222222222222222222222222222";

const key = await generatePrincipalKey();
const signer = await toSigner(key);
const doc = buildDidDocument("did:web:kya.local", key.publicJwk, key.kid);
const { delegation, claims } = await issueDelegation({
  signer,
  principal: { principalId: "demo", did: "did:web:kya.local:principals:demo", entityType: "business", name: "Acme Corp", verifiedAt: new Date().toISOString() },
  address: AGENT,
  sandboxId: "sb-demo",
  scope: { network: "eip155:84532", asset: USDC_ASSET, perTxLimit: "5000000", cumulativeLimit: "10000000", merchants: [MERCHANT] },
});

function request(amount: string, withDelegation = true): FacilitatorRequest {
  const requirements = { scheme: "exact", network: "eip155:84532", amount, asset: USDC_ASSET, payTo: MERCHANT, maxTimeoutSeconds: 60, extra: { name: "USDC", version: "2" } };
  return {
    x402Version: 2,
    paymentRequirements: requirements,
    paymentPayload: {
      x402Version: 2,
      resource: { url: "http://merchant.local/checkout-sessions/1/complete" },
      accepted: requirements,
      payload: { signature: "0xsig", authorization: { from: AGENT, to: MERCHANT, value: amount, validAfter: "0", validBefore: "9999999999", nonce: "0x01" } },
      extensions: { kya: { info: { verifier: "http://localhost:4000", required: true, ...(withDelegation ? { delegation } : {}) }, schema: { type: "object", properties: { delegation: { type: "string" } } } } },
    },
  };
}

writeFileSync(join(out, "did.json"), JSON.stringify(doc, null, 2));
writeFileSync(join(out, "delegation.jwt"), delegation);
writeFileSync(join(out, "jti"), claims.jti);
writeFileSync(join(out, "A-3.json"), JSON.stringify(request("3000000")));
writeFileSync(join(out, "B-8.json"), JSON.stringify(request("8000000")));
writeFileSync(join(out, "C-4.json"), JSON.stringify(request("4000000")));
writeFileSync(join(out, "no-delegation.json"), JSON.stringify(request("1000000", false)));
console.log(`fixtures → ${out} (jti=${claims.jti})`);
