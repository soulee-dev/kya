import { buildDidDocument, generatePrincipalKey, issueDelegation, toSigner, type FacilitatorRequest, type Principal, type Scope } from "../src/index.js";

export const AGENT = "0x1111111111111111111111111111111111111111";
export const MERCHANT = "0x2222222222222222222222222222222222222222";
export const OTHER_MERCHANT = "0x3333333333333333333333333333333333333333";

export const SCOPE: Scope = {
  network: "eip155:84532",
  asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  perTxLimit: "5000000",
  cumulativeLimit: "10000000",
  merchants: [MERCHANT],
};

export const PRINCIPAL: Principal = {
  principalId: "p1",
  did: "did:web:kya.test:principals:p1",
  entityType: "business",
  name: "Acme Corp",
  registrationNumber: "123-45-67890",
  verifiedAt: "2026-09-19T05:00:00.000Z",
};

export async function fixture(scope: Partial<Scope> = {}, ttlSeconds = 3600) {
  const key = await generatePrincipalKey();
  const signer = await toSigner(key);
  const doc = buildDidDocument("did:web:kya.test", key.publicJwk, key.kid);
  const issued = await issueDelegation({
    signer,
    principal: PRINCIPAL,
    address: AGENT,
    sandboxId: "sb-test",
    scope: { ...SCOPE, ...scope },
    ttlSeconds,
  });
  return { key, signer, doc, ...issued };
}

export function paymentRequest(opts: { amount: string; delegation?: string; from?: string; payTo?: string }): FacilitatorRequest {
  const requirements = {
    scheme: "exact",
    network: "eip155:84532",
    amount: opts.amount,
    asset: SCOPE.asset,
    payTo: opts.payTo ?? MERCHANT,
    maxTimeoutSeconds: 60,
    extra: { name: "USDC", version: "2" },
  };
  return {
    x402Version: 2,
    paymentRequirements: requirements,
    paymentPayload: {
      x402Version: 2,
      resource: { url: "https://merchant.test/checkout-sessions/1/complete" },
      accepted: requirements,
      payload: {
        signature: "0xsig",
        authorization: { from: opts.from ?? AGENT, to: requirements.payTo, value: opts.amount, validAfter: "0", validBefore: "9999999999", nonce: "0x01" },
      },
      extensions: {
        kya: {
          info: { verifier: "https://kya.test", required: true, ...(opts.delegation ? { delegation: opts.delegation } : {}) },
          schema: { type: "object", properties: { delegation: { type: "string" } } },
        },
      },
    },
  };
}
