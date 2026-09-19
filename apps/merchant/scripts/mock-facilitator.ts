// Stand-in for A's Verifier (docs/04-contract.md 접점 3) for local runs and as a demo fallback.
// Performs the KYA checks that need no chain (1, 5) and returns a mock settlement.
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";

const PORT = Number(process.env.PORT ?? 4000);
const PER_TX_LIMIT = BigInt(process.env.PER_TX_LIMIT ?? "5000000");
const CUMULATIVE_LIMIT = BigInt(process.env.CUMULATIVE_LIMIT ?? "10000000");
const ledger = new Map<string, bigint>();
const decisions: unknown[] = [];

type Body = { paymentPayload: any; paymentRequirements: any };
function check({ paymentPayload, paymentRequirements }: Body) {
  const delegation = paymentPayload?.extensions?.kya?.info?.delegation;
  const payer = paymentPayload?.payload?.authorization?.from;
  const amount = BigInt(paymentRequirements?.amount ?? "0");
  if (!delegation) return { ok: false, reason: "kya:missing_delegation", payer, amount };
  if (amount > PER_TX_LIMIT) return { ok: false, reason: "kya:per_tx_limit_exceeded", payer, amount };
  const spent = ledger.get(delegation) ?? 0n;
  if (spent + amount > CUMULATIVE_LIMIT) return { ok: false, reason: "kya:cumulative_limit_exceeded", payer, amount };
  return { ok: true, reason: "ok", payer, amount, delegation };
}

const app = new Hono();
app.use("*", cors());
app.get("/supported", (c) =>
  c.json({ kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:84532" }], extensions: ["kya"], signers: {} }),
);
app.post("/verify", async (c) => {
  const r = check(await c.req.json());
  decisions.unshift({ at: new Date().toISOString(), stage: "verify", ...r, amount: r.amount.toString() });
  console.log("[verify]", r.ok ? "approved" : r.reason, r.amount.toString());
  return c.json(r.ok ? { isValid: true, payer: r.payer } : { isValid: false, invalidReason: r.reason, payer: r.payer });
});
app.post("/settle", async (c) => {
  const r = check(await c.req.json());
  if (!r.ok) return c.json({ success: false, errorReason: r.reason, payer: r.payer, transaction: "", network: "eip155:84532" });
  ledger.set(r.delegation!, (ledger.get(r.delegation!) ?? 0n) + r.amount);
  const transaction = "0xmock" + Math.random().toString(16).slice(2, 14).padEnd(60, "0");
  decisions.unshift({ at: new Date().toISOString(), stage: "settle", ...r, amount: r.amount.toString(), transaction });
  console.log("[settle] approved", r.amount.toString(), "cumulative", ledger.get(r.delegation!)!.toString());
  return c.json({ success: true, payer: r.payer, transaction, network: "eip155:84532" });
});
app.get("/decisions", (c) => c.json(decisions));
serve({ fetch: app.fetch, port: PORT }, () => console.log(`[mock-verifier] http://localhost:${PORT} perTx=${PER_TX_LIMIT} cumulative=${CUMULATIVE_LIMIT}`));
