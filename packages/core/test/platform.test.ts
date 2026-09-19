import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createPlatform, createDidWebResolver, verifyDelegation } from "../src/index.js";
import { AGENT, MERCHANT } from "./fixtures.js";

describe("platform (issuance)", () => {
  it("identity → sandbox → register → issue → did.json verifies the JWT", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kya-p-"));
    const p = await createPlatform({ host: "localhost:4001", dataDir: dir });

    const principal = await p.verifyIdentity({ entityType: "business", name: "Acme", registrationNumber: "1" });
    expect(principal.did).toBe(`did:web:localhost%3A4001:principals:${principal.principalId}`);

    const { sandboxId } = await p.createSandbox();
    p.registerAgent({ sandboxId, address: AGENT.toUpperCase().replace("0X", "0x") });
    expect(p.getDelegation(AGENT)).toBeUndefined();

    const rec = await p.issueDelegation({ principalId: principal.principalId, address: AGENT, scope: { perTxLimit: "5000000", cumulativeLimit: "10000000", merchants: [MERCHANT] } });
    expect(p.getDelegation(AGENT)?.jti).toBe(rec.jti);

    const doc = p.didDocument();
    const resolve = createDidWebResolver({ fetchImpl: async (url) => (String(url) === "http://localhost:4001/.well-known/did.json" ? Response.json(doc) : new Response("", { status: 404 })) });
    const claims = await verifyDelegation(rec.delegation, resolve);
    expect(claims.vc.credentialSubject.sandboxId).toBe(sandboxId);
    expect(claims.vc.credentialSubject.scope.merchants).toEqual([MERCHANT]);

    p.recordEvent(AGENT, { step: "boot", message: "hi" });
    const s = p.state();
    expect(s.agent).toMatchObject({ address: AGENT, funded: false });
    expect(s.delegation?.jti).toBe(rec.jti);
    expect(s.events).toHaveLength(1);

    // 재시작: 같은 키, 같은 상태
    const p2 = await createPlatform({ host: "localhost:4001", dataDir: dir });
    expect(p2.didDocument().verificationMethod[0].publicKeyJwk.x).toBe(doc.verificationMethod[0].publicKeyJwk.x);
    expect(p2.getDelegation(AGENT)?.jti).toBe(rec.jti);
  });

  it("rejects bad input with 400", async () => {
    const p = await createPlatform({ host: "localhost:4001", dataDir: mkdtempSync(join(tmpdir(), "kya-p-")) });
    await expect(p.verifyIdentity({ entityType: "business", name: "x" })).rejects.toMatchObject({ status: 400 });
    expect(() => p.registerAgent({ sandboxId: "s", address: "nope" })).toThrow();
  });
});
