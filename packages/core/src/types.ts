/**
 * KYA 도메인 타입. 용어는 CONTEXT.md, 형식은 docs/04-contract.md를 따른다.
 * 금액은 모든 곳에서 atomic units 문자열(1 USDC = "1000000")이다.
 */

export const NETWORK = "eip155:84532" as const;
export const USDC_ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
export const DEFAULT_FUNDING_AMOUNT = "20000000" as const;
export const DEFAULT_DELEGATION_TTL_SECONDS = 60 * 60;

export type EntityType = "person" | "business";

export interface Principal {
  principalId: string;
  did: string;
  entityType: EntityType;
  name: string;
  registrationNumber?: string;
  verifiedAt: string;
}

export interface Scope {
  network: string;
  asset: string;
  perTxLimit: string;
  cumulativeLimit: string;
  merchants: string[];
}

export interface DelegationCredentialSubject {
  id: string;
  sandboxId: string;
  principal: { entityType: EntityType; name: string; verifiedAt: string };
  scope: Scope;
}

export interface DelegationClaims {
  iss: string;
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  vc: {
    type: ["VerifiableCredential", "AgentDelegation"];
    credentialSubject: DelegationCredentialSubject;
  };
}

export interface DelegationRecord {
  jti: string;
  address: string;
  principalId: string;
  sandboxId: string;
  scope: Scope;
  iat: number;
  exp: number;
  delegation: string;
  fundingTx?: string;
}

export interface AgentRecord {
  address: string;
  sandboxId: string;
  registeredAt: string;
}

export interface AgentEvent {
  at: string;
  address: string;
  step: string;
  message: string;
}

export interface SandboxRecord {
  sandboxId: string;
  createdAt: string;
}

export type DenyCode =
  | "kya:missing_delegation"
  | "kya:invalid_delegation"
  | "kya:subject_mismatch"
  | "kya:merchant_not_allowed"
  | "kya:per_tx_limit_exceeded"
  | "kya:cumulative_limit_exceeded";

export type DecisionPhase = "verify" | "settle";

export interface Decision {
  at: string;
  phase: DecisionPhase;
  jti?: string;
  payer?: string;
  payTo: string;
  amount: string;
  decision: "approved" | "denied";
  reason: string;
  txHash?: string;
  principal?: { name: string; entityType: EntityType };
}

/* ---------- x402 v2 (docs/03-ucp-x402-facts.md §2.2, §2.4) ---------- */

export interface PaymentRequirements {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
}

export interface ExactEvmAuthorization {
  from: string;
  to: string;
  value: string;
  validAfter?: string;
  validBefore?: string;
  nonce?: string;
}

export interface X402Extension {
  info: Record<string, unknown>;
  schema: Record<string, unknown>;
}

export interface KyaExtension extends X402Extension {
  info: { verifier: string; required: boolean; delegation?: string };
}

export interface PaymentPayload {
  x402Version: number;
  resource?: { url: string; description?: string; mimeType?: string };
  accepted?: PaymentRequirements;
  payload: { signature?: string; authorization?: ExactEvmAuthorization; [k: string]: unknown };
  extensions?: Record<string, X402Extension> & { kya?: KyaExtension };
}

export interface FacilitatorRequest {
  x402Version: number;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

export interface SettleResponse {
  success: boolean;
  errorReason?: string;
  payer?: string;
  transaction?: string;
  network?: string;
  amount?: string;
}

export interface SupportedResponse {
  kinds: Array<{ x402Version: number; scheme: string; network: string; extra?: unknown }>;
  extensions: string[];
  signers?: Record<string, string[]>;
}

/** x402 `extensions.kya` 광고 형태(Merchant의 402 응답에 들어간다). */
export function kyaExtensionAdvert(verifierUrl: string): KyaExtension {
  return {
    info: { verifier: verifierUrl, required: true },
    schema: { type: "object", properties: { delegation: { type: "string" } } },
  };
}
