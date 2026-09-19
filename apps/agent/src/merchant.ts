import { x402Client, x402HTTPClient } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import type { LocalAccount } from "viem";
import { config } from "./config.js";

export interface Product {
  id: string;
  source: string;
  title: string;
  brand: string;
  priceKRW: number;
  amount: string;
  priceUSDC: string;
  imageUrl: string;
  url: string;
  category: string;
  tags: string[];
}
export interface Checkout {
  id: string;
  status: "ready_for_complete" | "complete_in_progress" | "completed" | "canceled";
  total: string;
  line_items: { item: { id: string; title: string; brand: string }; quantity: number }[];
  order?: { id: string; tx?: string };
}
export interface Command { id: string; text: string }

export type PayOutcome =
  | { ok: true; checkout: Checkout; tx?: string }
  | { ok: false; reason: string; checkout?: Checkout };

const M = config.merchantUrl;

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export async function searchProducts(q: string, limit = 8): Promise<Product[]> {
  const u = new URL(`${M}/products`);
  if (q) u.searchParams.set("q", q);
  u.searchParams.set("limit", String(limit));
  const { products } = await json<{ products: Product[] }>(await fetch(u));
  return products;
}
export async function listProducts(): Promise<Product[]> {
  const { products } = await json<{ products: Product[] }>(await fetch(`${M}/products`));
  return products;
}

export async function createCheckout(productId: string, quantity = 1, commandId?: string): Promise<Checkout> {
  return json<Checkout>(
    await fetch(`${M}/checkout-sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ line_items: [{ item: { id: productId }, quantity }], command_id: commandId }),
    }),
  );
}

// ── x402 payer ────────────────────────────────────────────────────────────
// Signs `exact` EVM payments with the sandbox key and echoes the merchant's `kya`
// extension back with `info.delegation` added (docs/04-contract.md 접점 2).
export function createPayer(account: LocalAccount, delegation?: string) {
  const client = registerExactEvmScheme(new x402Client(), { signer: account })
    // The KYA Verifier enforces the Scope; the client-side $1 default cap would block the demo.
    .setSpendControls(false)
    .registerExtension({
      key: "kya",
      enrichPaymentPayload: async (payload, required) => {
        const advertised = required.extensions?.kya as { info?: Record<string, unknown> } | undefined;
        if (!advertised || !delegation) return payload;
        return {
          ...payload,
          extensions: {
            ...payload.extensions,
            kya: { ...advertised, info: { ...advertised.info, delegation } },
          },
        };
      },
    });
  const http = new x402HTTPClient(client);
  const fetchWithPay = wrapFetchWithPayment(fetch, http);

  return async function completeCheckout(checkoutId: string): Promise<PayOutcome> {
    let res: Response;
    try {
      res = await fetchWithPay(`${M}/checkout-sessions/${checkoutId}/complete`, { method: "POST" });
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
    const parsed = await http.processResponse(res);
    if (parsed.status === 402) {
      // Verifier said no: the 402 carries the facilitator's invalidReason (e.g. kya:per_tx_limit_exceeded).
      const err = (parsed.header as { error?: string } | undefined)?.error ?? "payment_required";
      const body = parsed.body as { checkout?: Checkout } | undefined;
      return { ok: false, reason: err, checkout: body?.checkout };
    }
    if (!res.ok) return { ok: false, reason: `${parsed.status} ${JSON.stringify(parsed.body)}` };
    const settle = parsed.header as { success?: boolean; transaction?: string; errorReason?: string } | undefined;
    if (settle && settle.success === false) return { ok: false, reason: settle.errorReason ?? "settle_failed", checkout: parsed.body as Checkout };
    return { ok: true, checkout: parsed.body as Checkout, tx: settle?.transaction };
  };
}

// ── storefront chat bridge ────────────────────────────────────────────────
export async function nextCommand(): Promise<Command | undefined> {
  const r = await fetch(`${M}/commands/next`).catch(() => undefined);
  if (!r || r.status === 204 || !r.ok) return undefined;
  return (await r.json()) as Command;
}
export async function commandEvent(commandId: string, step: string, message: string, data?: unknown) {
  await fetch(`${M}/commands/${commandId}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ step, message, data }),
  }).catch(() => undefined);
}
export async function commandDone(commandId: string, result: { outcome: "purchased" | "denied" | "not_found" | "error"; message: string; checkoutId?: string; productId?: string }) {
  await fetch(`${M}/commands/${commandId}/done`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ result }),
  }).catch(() => undefined);
}
