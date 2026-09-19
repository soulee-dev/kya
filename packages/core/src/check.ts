import { addressFromPkh } from "./did";
import { DelegationError, verifyDelegation, type DidResolver } from "./delegation";
import type { SpendLedger } from "./ledger";
import type { DelegationClaims, DenyCode, FacilitatorRequest } from "./types";

export type KyaCheckResult =
  | { ok: true; claims: DelegationClaims; payer: string; amount: string; payTo: string }
  | { ok: false; code: DenyCode; detail: string; payer?: string; claims?: DelegationClaims; amount: string; payTo: string };

export interface KyaCheckDeps {
  resolve: DidResolver;
  ledger: SpendLedger;
  now?: () => Date;
}

/**
 * 접점 3의 6단계 검사. 순서와 거절 코드는 계약 그대로.
 * 1 missing_delegation → 2 invalid_delegation → 3 subject_mismatch
 * → 4 merchant_not_allowed → 5 per_tx_limit_exceeded → 6 cumulative_limit_exceeded
 */
export async function checkPayment(req: FacilitatorRequest, deps: KyaCheckDeps): Promise<KyaCheckResult> {
  const { paymentPayload, paymentRequirements } = req;
  const payer = paymentPayload?.payload?.authorization?.from?.toLowerCase();
  const payTo = (paymentRequirements?.payTo ?? "").toLowerCase();
  const amount = String(paymentRequirements?.amount ?? "0");
  const base = { payer, amount, payTo };

  const delegation = paymentPayload?.extensions?.kya?.info?.delegation;
  if (typeof delegation !== "string" || delegation.length === 0) {
    return { ok: false, code: "kya:missing_delegation", detail: "extensions.kya.info.delegation is absent", ...base };
  }

  let claims: DelegationClaims;
  try {
    claims = await verifyDelegation(delegation, deps.resolve, deps.now?.());
  } catch (e) {
    const detail = e instanceof DelegationError ? e.message : String(e);
    return { ok: false, code: "kya:invalid_delegation", detail, ...base };
  }

  const subject = addressFromPkh(claims.sub);
  if (!subject || !payer || subject !== payer) {
    return {
      ok: false,
      code: "kya:subject_mismatch",
      detail: `delegation subject ${subject ?? "?"} ≠ authorization.from ${payer ?? "?"}`,
      claims,
      ...base,
    };
  }

  const scope = claims.vc.credentialSubject.scope;
  if (!scope.merchants.some((m) => m.toLowerCase() === payTo)) {
    return { ok: false, code: "kya:merchant_not_allowed", detail: `payTo ${payTo} not in merchant allowlist`, claims, ...base };
  }

  let amountBn: bigint;
  try {
    amountBn = BigInt(amount);
  } catch {
    return { ok: false, code: "kya:per_tx_limit_exceeded", detail: `amount ${amount} is not an integer`, claims, ...base };
  }
  if (amountBn > BigInt(scope.perTxLimit)) {
    return {
      ok: false,
      code: "kya:per_tx_limit_exceeded",
      detail: `amount ${amount} > perTxLimit ${scope.perTxLimit}`,
      claims,
      ...base,
    };
  }

  const spent = deps.ledger.spent(claims.jti);
  if (spent + amountBn > BigInt(scope.cumulativeLimit)) {
    return {
      ok: false,
      code: "kya:cumulative_limit_exceeded",
      detail: `spent ${spent} + amount ${amount} > cumulativeLimit ${scope.cumulativeLimit}`,
      claims,
      ...base,
    };
  }

  return { ok: true, claims, payer, amount, payTo };
}
