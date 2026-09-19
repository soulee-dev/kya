// LLM-free run of the contract demo (A 3 → B 8 → C 4 → C 4 USDC) through the real x402 client.
// Usage: MERCHANT_URL=... [KYA_DELEGATION=<jwt>] [AGENT_PRIVATE_KEY=0x..] npx tsx scripts/scenario.ts [A,B,C,C]
import { createPublicClient, http } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";

const MERCHANT_URL = (process.env.MERCHANT_URL ?? "http://localhost:5050").replace(/\/$/, "");
const delegation = process.env.KYA_DELEGATION;
const list = (process.argv[2] ?? "A,B,C,C").split(",");
const account = privateKeyToAccount((process.env.AGENT_PRIVATE_KEY as `0x${string}`) ?? generatePrivateKey());
const publicClient = createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC ?? "https://sepolia.base.org") });
const client = new x402Client()
  .setSpendControls(false) // the Delegation, not the client, is the spend limit
  .register("eip155:84532", new ExactEvmScheme(toClientEvmSigner(account, publicClient)))
  .registerExtension({
    key: "kya",
    enrichPaymentPayload: async (payload, required) => {
      const adv = (required.extensions?.kya ?? {}) as { info?: Record<string, unknown> };
      return { ...payload, extensions: { ...(payload.extensions ?? {}), kya: { ...adv, info: { ...(adv.info ?? {}), delegation } } } };
    },
  });
const pay = wrapFetchWithPayment(fetch, client);

console.log("agent", account.address);
for (const id of list) {
  const co = await (await fetch(`${MERCHANT_URL}/checkout-sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ line_items: [{ item: { id }, quantity: 1 }] }) })).json() as { id: string; total: string };
  const r = await pay(`${MERCHANT_URL}/checkout-sessions/${co.id}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch((e: Error) => e);
  if (r instanceof Error) { console.log(id, Number(co.total) / 1e6, "USDC → ERROR", r.message); continue; }
  if (r.status === 402) { const h = r.headers.get("payment-required"); console.log(id, Number(co.total) / 1e6, "USDC → DENIED", h ? decodePaymentRequiredHeader(h).error : await r.text()); continue; }
  const pr = r.headers.get("payment-response");
  console.log(id, Number(co.total) / 1e6, "USDC →", r.status, r.ok ? "APPROVED tx=" + (pr ? decodePaymentResponseHeader(pr).transaction?.slice(0, 14) : "?") : await r.text());
}
