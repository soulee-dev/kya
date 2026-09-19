import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createVerifier, SpendLedger, staticDidResolver } from "../src/index.js";
import { fixture, paymentRequest } from "./fixtures.js";

describe("verifier service (mock mode)", () => {
  it("runs the 4-scene demo, records decisions and persists the ledger", async () => {
    const f = await fixture();
    const dir = mkdtempSync(join(tmpdir(), "kya-"));
    const ledgerPath = join(dir, "ledger.json");
    const v = createVerifier({
      upstreamFacilitator: "http://127.0.0.1:9",
      mode: "mock",
      resolve: staticDidResolver(f.doc),
      ledger: new SpendLedger(ledgerPath),
      decisionsPath: join(dir, "decisions.json"),
      fetchImpl: async () => new Response("{}", { status: 500 }),
    });
    const req = (amount: string) => paymentRequest({ amount, delegation: f.delegation });

    expect((await v.supported()).extensions).toContain("kya");

    expect(await v.verify(req("3000000"))).toMatchObject({ isValid: true });
    const s1 = await v.settle(req("3000000"));
    expect(s1.success).toBe(true);
    expect(s1.transaction).toMatch(/^0xmock/);

    expect(await v.verify(req("8000000"))).toMatchObject({ isValid: false, invalidReason: "kya:per_tx_limit_exceeded" });

    expect(await v.verify(req("4000000"))).toMatchObject({ isValid: true });
    expect((await v.settle(req("4000000"))).success).toBe(true);

    expect(await v.verify(req("4000000"))).toMatchObject({ isValid: false, invalidReason: "kya:cumulative_limit_exceeded" });
    expect(await v.settle(req("4000000"))).toMatchObject({ success: false, errorReason: "kya:cumulative_limit_exceeded" });

    expect(v.ledgerFor(f.claims.jti)).toEqual({ jti: f.claims.jti, spent: "7000000", cumulativeLimit: "10000000" });
    expect(JSON.parse(readFileSync(ledgerPath, "utf8"))[f.claims.jti].spent).toBe("7000000");

    const d = v.decisions();
    expect(d[0]).toMatchObject({ phase: "settle", decision: "denied", reason: "kya:cumulative_limit_exceeded", principal: { name: "Acme Corp" } });
    expect(d.filter((x) => x.decision === "approved" && x.phase === "settle")).toHaveLength(2);

    // 재시작 후에도 원장이 살아 있다
    const v2 = createVerifier({ upstreamFacilitator: "x", mode: "mock", resolve: staticDidResolver(f.doc), ledger: new SpendLedger(ledgerPath) });
    expect(v2.ledgerFor(f.claims.jti).spent).toBe("7000000");
  });

  it("forwards to upstream in live mode only after KYA passes", async () => {
    const f = await fixture();
    const calls: string[] = [];
    const v = createVerifier({
      upstreamFacilitator: "http://up",
      mode: "live",
      resolve: staticDidResolver(f.doc),
      ledger: new SpendLedger(),
      fetchImpl: async (url, init) => {
        calls.push(String(url));
        const body = init?.method === "POST" ? JSON.parse(String(init.body)) : null;
        if (String(url).endsWith("/verify")) return Response.json({ isValid: true, payer: body.paymentPayload.payload.authorization.from });
        return Response.json({ success: true, transaction: "0xreal", network: "eip155:84532" });
      },
    });
    expect(await v.verify(paymentRequest({ amount: "8000000", delegation: f.delegation }))).toMatchObject({ isValid: false });
    expect(calls).toHaveLength(0);
    expect(await v.settle(paymentRequest({ amount: "3000000", delegation: f.delegation }))).toMatchObject({ success: true, transaction: "0xreal" });
    expect(calls).toEqual(["http://up/settle"]);
    expect(v.ledgerFor(f.claims.jti).spent).toBe("3000000");
  });
});
