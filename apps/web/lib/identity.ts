import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { exportJWK, generateKeyPair, importJWK, SignJWT, type JWK } from "jose";
import { dataDir } from "./store";
import type { Principal, Scope } from "./types";
let keyPromise: Promise<{ privateJwk: JWK; publicJwk: JWK }> | undefined;
export function keys() {
  return (keyPromise ??= (async () => {
    const file = path.join(dataDir, "principal-key.json");
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const pair = await generateKeyPair("EdDSA", { extractable: true });
    const pairJson = {
      privateJwk: await exportJWK(pair.privateKey),
      publicJwk: await exportJWK(pair.publicKey),
    };
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    try {
      await writeFile(file, JSON.stringify(pairJson), {
        mode: 0o600,
        flag: "wx",
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      return JSON.parse(await readFile(file, "utf8"));
    }
    return pairJson;
  })());
}
export function publicOrigin() {
  const host = process.env.PUBLIC_HOST || "localhost:3000";
  return host.includes("://")
    ? new URL(host).origin
    : `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"}://${host}`;
}
export function didHost() {
  return new URL(publicOrigin()).host.replaceAll(":", "%3A");
}
export async function didDocument(principalId?: string) {
  const { publicJwk } = await keys();
  const id = `did:web:${didHost()}${principalId ? `:principals:${principalId}` : ""}`;
  const kid = `${id}#key-1`;
  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/jws-2020/v1",
    ],
    id,
    verificationMethod: [
      {
        id: kid,
        type: "JsonWebKey2020",
        controller: id,
        publicKeyJwk: { ...publicJwk, alg: "EdDSA", use: "sig" },
      },
    ],
    authentication: [kid],
    assertionMethod: [kid],
  };
}
export async function issue(
  principal: Principal,
  address: string,
  sandboxId: string,
  scope: Scope,
) {
  const { privateJwk } = await keys();
  const jti = crypto.randomUUID();
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const sub = `did:pkh:eip155:84532:${address}`;
  const token = await new SignJWT({
    vc: {
      type: ["VerifiableCredential", "AgentDelegation"],
      credentialSubject: {
        id: sub,
        sandboxId,
        principal: {
          entityType: principal.entityType,
          name: principal.name,
          verifiedAt: principal.verifiedAt,
        },
        scope,
      },
    },
  })
    .setProtectedHeader({
      alg: "EdDSA",
      kid: `${principal.did}#key-1`,
      typ: "JWT",
    })
    .setIssuer(principal.did)
    .setSubject(sub)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(await importJWK(privateJwk, "EdDSA"));
  return { token, jti, exp, scope, fundingStatus: "pending" as const };
}
