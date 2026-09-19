import { describe, expect, it } from "vitest";
import { checkPayment, SpendLedger, staticDidResolver } from "../src/index";
import { fixture, OTHER_MERCHANT, paymentRequest } from "./fixtures";

describe("KYA 6단계 검사", () => {
  it("1 missing_delegation", async () => {
    const f = await fixture();
    const r = await checkPayment(paymentRequest({ amount: "3000000" }), { resolve: staticDidResolver(f.doc), ledger: new SpendLedger() });
    expect(r).toMatchObject({ ok: false, code: "kya:missing_delegation" });
  });

  it("2 invalid_delegation", async () => {
    const f = await fixture();
    const r = await checkPayment(paymentRequest({ amount: "3000000", delegation: f.delegation.slice(0, -4) + "AAAA" }), {
      resolve: staticDidResolver(f.doc),
      ledger: new SpendLedger(),
    });
    expect(r).toMatchObject({ ok: false, code: "kya:invalid_delegation" });
  });

  it("3 subject_mismatch", async () => {
    const f = await fixture();
    const r = await checkPayment(
      paymentRequest({ amount: "3000000", delegation: f.delegation, from: "0x9999999999999999999999999999999999999999" }),
      { resolve: staticDidResolver(f.doc), ledger: new SpendLedger() },
    );
    expect(r).toMatchObject({ ok: false, code: "kya:subject_mismatch" });
  });

  it("4 merchant_not_allowed", async () => {
    const f = await fixture();
    const r = await checkPayment(paymentRequest({ amount: "3000000", delegation: f.delegation, payTo: OTHER_MERCHANT }), {
      resolve: staticDidResolver(f.doc),
      ledger: new SpendLedger(),
    });
    expect(r).toMatchObject({ ok: false, code: "kya:merchant_not_allowed" });
  });

  it("5/6 demo scenario: 3 ok → 8 per_tx → 4 ok → 4 cumulative", async () => {
    const f = await fixture();
    const ledger = new SpendLedger();
    const deps = { resolve: staticDidResolver(f.doc), ledger };
    const run = (amount: string) => checkPayment(paymentRequest({ amount, delegation: f.delegation }), deps);
    const settle = (amount: string) => ledger.add(f.claims.jti, amount, "10000000", { payTo: "0x2222222222222222222222222222222222222222" });

    expect((await run("3000000")).ok).toBe(true);
    settle("3000000");
    expect(await run("8000000")).toMatchObject({ ok: false, code: "kya:per_tx_limit_exceeded" });
    expect((await run("4000000")).ok).toBe(true);
    settle("4000000");
    expect(await run("4000000")).toMatchObject({ ok: false, code: "kya:cumulative_limit_exceeded" });
    expect(ledger.spent(f.claims.jti)).toBe(7000000n);
  });
});
