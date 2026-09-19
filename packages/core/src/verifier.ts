import { randomBytes } from "node:crypto";
import { checkPayment, type KyaCheckResult } from "./check.js";
import type { DidResolver } from "./delegation.js";
import { SpendLedger } from "./ledger.js";
import { JsonState } from "./store.js";
import type {
  Decision,
  DecisionPhase,
  FacilitatorRequest,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from "./types.js";

export type SettleMode = "live" | "mock";

export interface VerifierOptions {
  upstreamFacilitator: string;
  mode: SettleMode;
  resolve: DidResolver;
  ledger: SpendLedger;
  decisionsPath?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** 판정 목록 최대 보관 개수 */
  maxDecisions?: number;
}

export interface Verifier {
  supported(): Promise<SupportedResponse>;
  verify(req: FacilitatorRequest): Promise<VerifyResponse>;
  settle(req: FacilitatorRequest): Promise<SettleResponse>;
  decisions(filter?: { phase?: DecisionPhase; limit?: number }): Decision[];
  ledgerFor(jti: string): { jti: string; spent: string; cumulativeLimit: string | null };
  readonly ledger: SpendLedger;
}

const FALLBACK_SUPPORTED: SupportedResponse = {
  kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:84532" }],
  extensions: [],
};

/**
 * x402 facilitator 인터페이스 앞에 서는 KYA Verifier.
 * 검사 통과 → 상위 facilitator로 같은 본문을 전달. settle 성공 → Spend Ledger 가산.
 */
export function createVerifier(opts: VerifierOptions): Verifier {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date());
  const decisions = new JsonState<Decision[]>(opts.decisionsPath, () => []);
  const max = opts.maxDecisions ?? 500;

  function record(phase: DecisionPhase, r: KyaCheckResult, extra: Partial<Decision> = {}): Decision {
    const principal = r.claims?.vc.credentialSubject.principal;
    const d: Decision = {
      at: now().toISOString(),
      phase,
      jti: r.claims?.jti,
      payer: r.payer,
      payTo: r.payTo,
      amount: r.amount,
      decision: r.ok ? "approved" : "denied",
      reason: r.ok ? "kya:ok" : r.code,
      ...(principal ? { principal: { name: principal.name, entityType: principal.entityType } } : {}),
      ...extra,
    };
    decisions.update((all) => {
      all.unshift(d);
      if (all.length > max) all.length = max;
    });
    return d;
  }

  async function upstream<T>(path: string, body: unknown): Promise<T> {
    const res = await fetchImpl(`${opts.upstreamFacilitator}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: T;
    try {
      json = JSON.parse(text) as T;
    } catch {
      throw new Error(`upstream ${path} returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
    }
    return json;
  }

  return {
    ledger: opts.ledger,

    async supported() {
      let base: SupportedResponse = FALLBACK_SUPPORTED;
      try {
        const res = await fetchImpl(`${opts.upstreamFacilitator}/supported`);
        if (res.ok) base = (await res.json()) as SupportedResponse;
      } catch {
        /* 상위가 죽어도 kya는 광고한다 */
      }
      const extensions = Array.from(new Set([...(base.extensions ?? []), "kya"]));
      return { ...base, extensions };
    },

    async verify(req) {
      const r = await checkPayment(req, { resolve: opts.resolve, ledger: opts.ledger, now });
      if (!r.ok) {
        record("verify", r, { reason: r.code });
        return { isValid: false, invalidReason: r.code, payer: r.payer };
      }
      if (opts.mode === "mock") {
        record("verify", r);
        return { isValid: true, payer: r.payer };
      }
      const up = await upstream<VerifyResponse>("/verify", req);
      record("verify", r, up.isValid ? {} : { decision: "denied", reason: `upstream:${up.invalidReason ?? "invalid"}` });
      return up;
    },

    async settle(req) {
      const r = await checkPayment(req, { resolve: opts.resolve, ledger: opts.ledger, now });
      if (!r.ok) {
        record("settle", r, { reason: r.code });
        return { success: false, errorReason: r.code, payer: r.payer, network: req.paymentRequirements?.network };
      }
      let up: SettleResponse;
      if (opts.mode === "mock") {
        up = {
          success: true,
          payer: r.payer,
          transaction: `0xmock${randomBytes(29).toString("hex")}`,
          network: req.paymentRequirements.network,
          amount: r.amount,
        };
      } else {
        up = await upstream<SettleResponse>("/settle", req);
      }
      if (up.success) {
        const scope = r.claims.vc.credentialSubject.scope;
        opts.ledger.add(r.claims.jti, r.amount, scope.cumulativeLimit, { payTo: r.payTo, txHash: up.transaction });
        record("settle", r, { txHash: up.transaction });
      } else {
        record("settle", r, { decision: "denied", reason: `upstream:${up.errorReason ?? "settle_failed"}` });
      }
      return up;
    },

    decisions(filter = {}) {
      let list = decisions.get();
      if (filter.phase) list = list.filter((d) => d.phase === filter.phase);
      if (filter.limit) list = list.slice(0, filter.limit);
      return list;
    },

    ledgerFor(jti) {
      const e = opts.ledger.entry(jti);
      return { jti, spent: e?.spent ?? "0", cumulativeLimit: e?.cumulativeLimit ?? null };
    },
  };
}
