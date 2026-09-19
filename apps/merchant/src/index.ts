import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { HTTPRequestContext } from "@x402/core/http";
import { randomUUID } from "node:crypto";
import { products, findProduct, searchProducts, type Product } from "./catalog.js";
import { store, type Checkout, type Command } from "./store.js";

// ── constants from docs/04-contract.md ─────────────────────────────────────
const NETWORK = "eip155:84532" as const;
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const UCP_VERSION = "2026-08-25";

const PORT = Number(process.env.PORT ?? 5050);
const PAY_TO = process.env.MERCHANT_PAYTO ?? "0x0000000000000000000000000000000000000001";
// A's Verifier speaks the facilitator interface. Falls back to the public testnet facilitator
// (no KYA check) so the merchant runs standalone.
const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";
const PUBLIC_URL = process.env.MERCHANT_PUBLIC_URL ?? `http://localhost:${PORT}`;

// ── x402 resource server ───────────────────────────────────────────────────
const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitator).register(NETWORK, new ExactEvmScheme());

function delegationOf(payload: unknown): string | undefined {
  const ext = (payload as { extensions?: { kya?: { info?: { delegation?: string } } } })?.extensions;
  return ext?.kya?.info?.delegation;
}
function payerOf(payload: unknown): string | undefined {
  return (payload as { payload?: { authorization?: { from?: string } } })?.payload?.authorization?.from;
}

resourceServer
  .onAfterVerify(async (ctx) => {
    const r = ctx.result as { isValid: boolean; invalidReason?: string };
    store.decide({
      checkoutId: checkoutIdFromUrl(ctx.paymentPayload.resource?.url),
      payer: payerOf(ctx.paymentPayload),
      amount: ctx.requirements.amount,
      decision: r.isValid ? "approved" : "denied",
      reason: r.isValid ? "verified" : (r.invalidReason ?? "invalid"),
      hasDelegation: Boolean(delegationOf(ctx.paymentPayload)),
      stage: "verify",
    });
  })
  .onVerifyFailure(async (ctx) => {
    store.decide({
      checkoutId: checkoutIdFromUrl(ctx.paymentPayload.resource?.url),
      payer: payerOf(ctx.paymentPayload),
      amount: ctx.requirements.amount,
      decision: "denied",
      reason: ctx.error.message,
      hasDelegation: Boolean(delegationOf(ctx.paymentPayload)),
      stage: "verify",
    });
  })
  .onAfterSettle(async (ctx) => {
    const r = ctx.result as { success: boolean; transaction?: string; errorReason?: string };
    const id = checkoutIdFromUrl(ctx.paymentPayload.resource?.url);
    if (r.success && id) store.completeCheckout(id, r.transaction);
    store.decide({
      checkoutId: id,
      payer: payerOf(ctx.paymentPayload),
      amount: ctx.requirements.amount,
      decision: r.success ? "approved" : "denied",
      reason: r.success ? "settled" : (r.errorReason ?? "settle_failed"),
      txHash: r.transaction,
      hasDelegation: Boolean(delegationOf(ctx.paymentPayload)),
      stage: "settle",
    });
  })
  .onSettleFailure(async (ctx) => {
    store.decide({
      checkoutId: checkoutIdFromUrl(ctx.paymentPayload.resource?.url),
      payer: payerOf(ctx.paymentPayload),
      amount: ctx.requirements.amount,
      decision: "denied",
      reason: ctx.error.message,
      hasDelegation: Boolean(delegationOf(ctx.paymentPayload)),
      stage: "settle",
    });
  });

function checkoutIdFromUrl(url?: string): string | undefined {
  return url?.match(/checkout-sessions\/([^/]+)\/complete/)?.[1];
}
function checkoutIdFromPath(path: string): string {
  return path.match(/checkout-sessions\/([^/]+)\/complete/)?.[1] ?? "";
}

// The 402 for /complete carries the session total and advertises the `kya` extension
// exactly as docs/04-contract.md 접점 2 specifies.
const paywall = paymentMiddleware(
  {
    "POST /checkout-sessions/:id/complete": {
      accepts: {
        scheme: "exact",
        network: NETWORK,
        payTo: PAY_TO,
        maxTimeoutSeconds: 60,
        price: (ctx: HTTPRequestContext) => {
          const co = store.getCheckout(checkoutIdFromPath(ctx.path));
          if (!co) throw new Error("checkout not found");
          return { asset: USDC, amount: co.total, extra: { name: "USDC", version: "2" } };
        },
      },
      description: "Complete UCP checkout (KYA-verified x402 payment)",
      mimeType: "application/json",
      extensions: {
        kya: {
          info: { verifier: FACILITATOR_URL, required: true },
          schema: { type: "object", properties: { delegation: { type: "string" } } },
        },
      },
      unpaidResponseBody: (ctx) => ({
        contentType: "application/json",
        body: { checkout: store.getCheckout(checkoutIdFromPath(ctx.path)) ?? null },
      }),
    },
  },
  resourceServer,
);

// ── app ────────────────────────────────────────────────────────────────────
const app = new Hono();
app.use("*", cors());

app.get("/.well-known/ucp", (c) =>
  c.json({
    ucp: {
      version: UCP_VERSION,
      services: {
        "dev.ucp.shopping": {
          version: UCP_VERSION,
          transport: "rest",
          schema: `https://ucp.dev/${UCP_VERSION}/services/shopping/rest.openapi.json`,
          endpoint: PUBLIC_URL,
        },
      },
      capabilities: {
        "dev.ucp.shopping.checkout": [{ version: UCP_VERSION, schema: `https://ucp.dev/${UCP_VERSION}/schemas/shopping/checkout.json` }],
        "dev.ucp.shopping.catalog": [{ version: UCP_VERSION }],
      },
      payment_handlers: {
        "com.kya.x402": [
          {
            id: "kya_x402",
            version: "2026-09-19",
            spec: `${PUBLIC_URL}/handlers/com.kya.x402`,
            available_instruments: [{ type: "x402" }],
            config: { network: NETWORK, asset: USDC, payTo: PAY_TO, verifier: FACILITATOR_URL, x402Version: 2 },
          },
        ],
      },
    },
  }),
);

app.get("/products", (c) => {
  const q = c.req.query("q");
  const list = q ? searchProducts(q, Number(c.req.query("limit") ?? 12)) : products;
  return c.json({ products: list.map(publicProduct) });
});
app.get("/products/:id", (c) => {
  const p = findProduct(c.req.param("id"));
  return p ? c.json(publicProduct(p)) : c.json({ error: "not_found" }, 404);
});

app.post("/checkout-sessions", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    line_items?: { item: { id: string }; quantity?: number }[];
    buyer?: unknown;
    command_id?: string;
  };
  const items = body.line_items ?? [];
  if (items.length === 0) return c.json({ error: "line_items required" }, 400);
  const lines: Checkout["line_items"] = [];
  for (const li of items) {
    const p = findProduct(li.item.id);
    if (!p) return c.json({ error: `unknown item ${li.item.id}` }, 400);
    const qty = Math.max(1, Math.floor(li.quantity ?? 1));
    const amount = (BigInt(p.amount) * BigInt(qty)).toString();
    lines.push({
      id: `li_${randomUUID().slice(0, 8)}`,
      item: { id: p.id, title: p.title, price: { amount: p.amount, currency: "USDC" }, image_url: p.imageUrl, brand: p.brand, url: p.url },
      quantity: qty,
      totals: [{ type: "total", amount }],
    });
  }
  const total = lines.reduce((s, l) => s + BigInt(l.totals[0].amount), 0n).toString();
  const co = store.createCheckout({ line_items: lines, total, buyer: body.buyer, commandId: body.command_id, publicUrl: PUBLIC_URL });
  return c.json(co, 201);
});

app.get("/checkout-sessions/:id", (c) => {
  const co = store.getCheckout(c.req.param("id"));
  return co ? c.json(co) : c.json({ error: "not_found" }, 404);
});

app.post("/checkout-sessions/:id/cancel", (c) => {
  const co = store.getCheckout(c.req.param("id"));
  if (!co) return c.json({ error: "not_found" }, 404);
  co.status = "canceled";
  return c.json(co);
});

// x402-protected. Reaching the handler means the Verifier (A) approved the payment;
// settlement runs after this response and onAfterSettle flips status → completed.
app.use("/checkout-sessions/:id/complete", paywall);
app.post("/checkout-sessions/:id/complete", (c) => {
  const co = store.getCheckout(c.req.param("id"));
  if (!co) return c.json({ error: "not_found" }, 404);
  if (co.status === "completed") return c.json(co);
  co.status = "complete_in_progress";
  store.completeCheckout(co.id); // optimistic; settle hook adds txHash
  return c.json(store.getCheckout(co.id));
});

// ── storefront ↔ agent bridge (not part of the A/B contract) ───────────────
// The storefront chat posts a command; the Agent runner (in its Daytona sandbox) pulls it,
// reports progress here, and the storefront polls /commands/:id.
app.post("/commands", async (c) => {
  const { text } = (await c.req.json().catch(() => ({}))) as { text?: string };
  if (!text?.trim()) return c.json({ error: "text required" }, 400);
  const cmd = store.createCommand(text.trim());
  return c.json(cmd, 201);
});
app.get("/commands/next", (c) => {
  const cmd = store.claimNextCommand();
  return cmd ? c.json(cmd) : c.body(null, 204);
});
app.get("/commands/:id", (c) => {
  const cmd = store.getCommand(c.req.param("id"));
  return cmd ? c.json(cmd) : c.json({ error: "not_found" }, 404);
});
app.post("/commands/:id/events", async (c) => {
  const cmd = store.getCommand(c.req.param("id"));
  if (!cmd) return c.json({ error: "not_found" }, 404);
  const ev = (await c.req.json().catch(() => ({}))) as { step?: string; message?: string; data?: unknown };
  store.addEvent(cmd, ev.step ?? "info", ev.message ?? "", ev.data);
  return c.json({ ok: true });
});
app.post("/commands/:id/done", async (c) => {
  const cmd = store.getCommand(c.req.param("id"));
  if (!cmd) return c.json({ error: "not_found" }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { result?: Command["result"] };
  store.finishCommand(cmd, body.result);
  return c.json({ ok: true });
});

app.get("/state", (c) => c.json(store.snapshot()));

app.get("/handlers/com.kya.x402", (c) =>
  c.text(
    `com.kya.x402 — UCP payment handler carrying an x402 v2 PaymentPayload whose extensions.kya.info.delegation holds a KYA Delegation JWT. See docs/04-contract.md.`,
  ),
);

app.use("/*", serveStatic({ root: "./public" }));

function publicProduct(p: Product) {
  const { alias: _a, ...rest } = p;
  return { ...rest, priceUSDC: (Number(p.amount) / 1e6).toFixed(2) };
}

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[merchant] http://localhost:${PORT}  payTo=${PAY_TO}  facilitator=${FACILITATOR_URL}  products=${products.length}`);
});
