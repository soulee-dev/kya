import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createDidWebResolver,
  createVerifier,
  SpendLedger,
  type DidDocument,
  type FacilitatorRequest,
  type SettleMode,
} from "@kya/core";

const PORT = Number(process.env.PORT ?? 4000);
const UPSTREAM = (process.env.UPSTREAM_FACILITATOR ?? "https://x402.org/facilitator").replace(/\/$/, "");
const MODE = (process.env.KYA_SETTLE_MODE === "mock" ? "mock" : "live") as SettleMode;
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), "data");

/** DID_DOC_OVERRIDE: JSON 문자열 또는 파일 경로. 로컬 시나리오용. */
function loadOverride(): DidDocument | undefined {
  const v = process.env.DID_DOC_OVERRIDE;
  if (!v) return undefined;
  const text = v.trim().startsWith("{") ? v : readFileSync(v, "utf8");
  return JSON.parse(text) as DidDocument;
}

const verifier = createVerifier({
  upstreamFacilitator: UPSTREAM,
  mode: MODE,
  resolve: createDidWebResolver({ override: loadOverride() }),
  ledger: new SpendLedger(join(DATA_DIR, "ledger.json")),
  decisionsPath: join(DATA_DIR, "decisions.json"),
});

export const app = new Hono();
app.use("*", cors({ origin: "*" }));

app.get("/", (c) => c.json({ service: "kya-verifier", mode: MODE, upstream: UPSTREAM }));
app.get("/supported", async (c) => c.json(await verifier.supported()));

app.post("/verify", async (c) => {
  const body = (await c.req.json().catch(() => null)) as FacilitatorRequest | null;
  if (!body?.paymentPayload || !body?.paymentRequirements) {
    return c.json({ isValid: false, invalidReason: "kya:missing_delegation" }, 400);
  }
  return c.json(await verifier.verify(body));
});

app.post("/settle", async (c) => {
  const body = (await c.req.json().catch(() => null)) as FacilitatorRequest | null;
  if (!body?.paymentPayload || !body?.paymentRequirements) {
    return c.json({ success: false, errorReason: "kya:missing_delegation" }, 400);
  }
  return c.json(await verifier.settle(body));
});

app.get("/decisions", (c) => {
  const phase = c.req.query("phase");
  const limit = Number(c.req.query("limit") ?? 0) || undefined;
  return c.json(verifier.decisions({ phase: phase === "verify" || phase === "settle" ? phase : undefined, limit }));
});

app.get("/ledger/:jti", (c) => c.json(verifier.ledgerFor(c.req.param("jti"))));
app.get("/ledger", (c) => c.json(verifier.ledger.all()));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 502);
});

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[kya-verifier] :${PORT} mode=${MODE} upstream=${UPSTREAM} data=${DATA_DIR}`);
});
