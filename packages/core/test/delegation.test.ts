import { describe, expect, it } from "vitest";
import { addressFromPkh, didWebToDocumentUrl, generatePrincipalKey, buildDidDocument, staticDidResolver, verifyDelegation, DelegationError } from "../src/index.js";
import { AGENT, fixture } from "./fixtures.js";

describe("did helpers", () => {
  it("did:web → /.well-known/did.json on the host", () => {
    expect(didWebToDocumentUrl("did:web:kya.example.com:principals:abc")).toBe("https://kya.example.com/.well-known/did.json");
    expect(didWebToDocumentUrl("did:web:localhost%3A4001:principals:abc")).toBe("http://localhost:4001/.well-known/did.json");
  });
  it("did:pkh → lowercase address", () => {
    expect(addressFromPkh("did:pkh:eip155:84532:0xABCDEFabcdef1234567890ABCDEFabcdef123456")).toBe("0xabcdefabcdef1234567890abcdefabcdef123456");
    expect(addressFromPkh("did:web:x")).toBeUndefined();
  });
});

describe("delegation issue/verify", () => {
  it("roundtrips claims per contract 접점 1", async () => {
    const f = await fixture();
    const claims = await verifyDelegation(f.delegation, staticDidResolver(f.doc));
    expect(claims.iss).toBe("did:web:kya.test:principals:p1");
    expect(claims.sub).toBe(`did:pkh:eip155:84532:${AGENT}`);
    expect(claims.vc.type).toEqual(["VerifiableCredential", "AgentDelegation"]);
    expect(claims.vc.credentialSubject.scope.perTxLimit).toBe("5000000");
    expect(claims.vc.credentialSubject.principal.name).toBe("Acme Corp");
    expect(claims.exp - claims.iat).toBe(3600);
  });

  it("rejects a JWT signed by another key", async () => {
    const f = await fixture();
    const other = await generatePrincipalKey();
    const doc = buildDidDocument("did:web:kya.test", other.publicJwk, other.kid);
    await expect(verifyDelegation(f.delegation, staticDidResolver(doc))).rejects.toBeInstanceOf(DelegationError);
  });

  it("rejects an expired JWT", async () => {
    const f = await fixture({}, 10);
    const later = new Date(Date.now() + 60_000);
    await expect(verifyDelegation(f.delegation, staticDidResolver(f.doc), later)).rejects.toThrow(/expiry/);
  });
});
