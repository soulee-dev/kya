import { SignJWT, decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import { randomUUID } from "node:crypto";
import { agentDid, buildDidDocument, didWebToDocumentUrl, pickPublicJwk, type DidDocument } from "./did";
import type { PrincipalSigner } from "./keys";
import {
  DEFAULT_DELEGATION_TTL_SECONDS,
  type DelegationClaims,
  type Principal,
  type Scope,
} from "./types";

export interface IssueDelegationInput {
  signer: PrincipalSigner;
  principal: Principal;
  address: string;
  sandboxId: string;
  scope: Scope;
  ttlSeconds?: number;
  now?: Date;
}

export interface IssuedDelegation {
  delegation: string;
  claims: DelegationClaims;
}

/** 접점 1의 클레임으로 Delegation JWT(EdDSA)를 발급한다. */
export async function issueDelegation(input: IssueDelegationInput): Promise<IssuedDelegation> {
  const iat = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const exp = iat + (input.ttlSeconds ?? DEFAULT_DELEGATION_TTL_SECONDS);
  const address = input.address.toLowerCase();
  const sub = agentDid(address, input.scope.network);
  const claims: DelegationClaims = {
    iss: input.principal.did,
    sub,
    jti: randomUUID(),
    iat,
    exp,
    vc: {
      type: ["VerifiableCredential", "AgentDelegation"],
      credentialSubject: {
        id: sub,
        sandboxId: input.sandboxId,
        principal: {
          entityType: input.principal.entityType,
          name: input.principal.name,
          verifiedAt: input.principal.verifiedAt,
        },
        scope: {
          ...input.scope,
          merchants: input.scope.merchants.map((m) => m.toLowerCase()),
        },
      },
    },
  };
  const delegation = await new SignJWT({ vc: claims.vc })
    .setProtectedHeader({ alg: "EdDSA", typ: "JWT", kid: `${hostOf(input.principal.did)}#${input.signer.kid}` })
    .setIssuer(claims.iss)
    .setSubject(claims.sub)
    .setJti(claims.jti)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(input.signer.privateKey);
  return { delegation, claims };
}

/** `did:web:host:principals:id` → `did:web:host` */
export function hostOf(did: string): string {
  const parts = did.split(":");
  return parts.slice(0, 3).join(":");
}

export type DidResolver = (did: string) => Promise<DidDocument>;

export interface DidWebResolverOptions {
  /** 테스트·데모용: 네트워크 대신 이 문서를 그대로 쓴다. */
  override?: DidDocument;
  cacheTtlMs?: number;
  fetchImpl?: typeof fetch;
}

/** iss(did:web)를 `/.well-known/did.json`으로 바꿔 fetch. 60초 캐시. */
export function createDidWebResolver(opts: DidWebResolverOptions = {}): DidResolver {
  const ttl = opts.cacheTtlMs ?? 60_000;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const cache = new Map<string, { doc: DidDocument; until: number }>();
  return async (did) => {
    if (opts.override) return opts.override;
    const url = didWebToDocumentUrl(did);
    const hit = cache.get(url);
    if (hit && hit.until > Date.now()) return hit.doc;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`did document fetch failed: ${url} → ${res.status}`);
    const doc = (await res.json()) as DidDocument;
    cache.set(url, { doc, until: Date.now() + ttl });
    return doc;
  };
}

export function staticDidResolver(doc: DidDocument): DidResolver {
  return async () => doc;
}

export { buildDidDocument };

export class DelegationError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "DelegationError";
  }
}

/** 서명·exp·클레임 형태를 검증하고 클레임을 돌려준다. 실패하면 DelegationError. */
export async function verifyDelegation(jwt: string, resolve: DidResolver, now?: Date): Promise<DelegationClaims> {
  let header;
  try {
    header = decodeProtectedHeader(jwt);
  } catch (e) {
    throw new DelegationError("malformed jwt", e);
  }
  const unverified = decodePayloadUnsafe(jwt);
  const iss = unverified?.iss;
  if (typeof iss !== "string" || !iss.startsWith("did:web:")) throw new DelegationError("issuer is not did:web");

  let doc: DidDocument;
  try {
    doc = await resolve(iss);
  } catch (e) {
    throw new DelegationError("issuer did document unavailable", e);
  }
  const jwk = pickPublicJwk(doc, header.kid);
  if (!jwk) throw new DelegationError("issuer has no verification key");

  try {
    const key = await importJWK(jwk as JWK, "EdDSA");
    const { payload } = await jwtVerify(jwt, key, {
      algorithms: ["EdDSA"],
      issuer: iss,
      currentDate: now,
    });
    return assertClaims(payload);
  } catch (e) {
    if (e instanceof DelegationError) throw e;
    throw new DelegationError("signature or expiry check failed", e);
  }
}

function decodePayloadUnsafe(jwt: string): Record<string, unknown> | undefined {
  const part = jwt.split(".")[1];
  if (!part) return undefined;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
}

function assertClaims(p: Record<string, unknown>): DelegationClaims {
  const vc = p.vc as DelegationClaims["vc"] | undefined;
  const scope = vc?.credentialSubject?.scope;
  if (
    typeof p.sub !== "string" ||
    typeof p.jti !== "string" ||
    typeof p.exp !== "number" ||
    !vc?.type?.includes("AgentDelegation") ||
    !scope ||
    typeof scope.perTxLimit !== "string" ||
    typeof scope.cumulativeLimit !== "string" ||
    !Array.isArray(scope.merchants)
  ) {
    throw new DelegationError("claims are not an AgentDelegation");
  }
  return p as unknown as DelegationClaims;
}
