import type { JWK } from "jose";
import { NETWORK } from "./types";

/** `did:web:<host>[:path...]` → 공개키 문서 URL. 이 플랫폼은 host 단위로 키 하나를 `/.well-known/did.json`에 둔다. */
export function didWebToDocumentUrl(did: string): string {
  const parts = did.split(":");
  if (parts[0] !== "did" || parts[1] !== "web" || !parts[2]) {
    throw new Error(`not a did:web: ${did}`);
  }
  const host = decodeURIComponent(parts[2]);
  const scheme = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) ? "http" : "https";
  return `${scheme}://${host}/.well-known/did.json`;
}

/** 플랫폼 호스트의 did:web 식별자. 포트가 있으면 `:`를 `%3A`로 인코딩한다. */
export function hostDid(host: string): string {
  return `did:web:${encodeURIComponent(host)}`;
}

export function principalDid(host: string, principalId: string): string {
  return `${hostDid(host)}:principals:${principalId}`;
}

export function agentDid(address: string, network: string = NETWORK): string {
  return `did:pkh:${network}:${address}`;
}

/** `did:pkh:eip155:84532:0xabc…` → `0xabc…` (소문자). 형식이 다르면 undefined. */
export function addressFromPkh(did: string): string | undefined {
  const m = /^did:pkh:([a-z0-9]+:[A-Za-z0-9]+):(0x[0-9a-fA-F]{40})$/.exec(did);
  return m ? m[2].toLowerCase() : undefined;
}

export function networkFromPkh(did: string): string | undefined {
  const m = /^did:pkh:([a-z0-9]+:[A-Za-z0-9]+):/.exec(did);
  return m?.[1];
}

export interface DidDocument {
  "@context": string[];
  id: string;
  verificationMethod: Array<{
    id: string;
    type: "JsonWebKey2020";
    controller: string;
    publicKeyJwk: JWK;
  }>;
  assertionMethod: string[];
}

export function buildDidDocument(did: string, publicJwk: JWK, kid: string): DidDocument {
  const keyId = `${did}#${kid}`;
  return {
    "@context": ["https://www.w3.org/ns/did/v1", "https://w3id.org/security/suites/jws-2020/v1"],
    id: did,
    verificationMethod: [{ id: keyId, type: "JsonWebKey2020", controller: did, publicKeyJwk: publicJwk }],
    assertionMethod: [keyId],
  };
}

/** DID 문서에서 kid에 맞는 공개키를 고른다. kid가 없거나 못 찾으면 첫 키. */
export function pickPublicJwk(doc: DidDocument, kid?: string): JWK | undefined {
  const methods = doc.verificationMethod ?? [];
  if (kid) {
    const hit = methods.find((m) => m.id === kid || m.id.endsWith(`#${kid}`) || m.publicKeyJwk?.kid === kid);
    if (hit) return hit.publicKeyJwk;
  }
  return methods[0]?.publicKeyJwk;
}
