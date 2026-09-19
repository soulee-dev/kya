import path from "node:path";
import {
  buildDidDocument,
  hostDid,
  issueDelegation,
  loadOrCreatePrincipalKey,
  principalDid,
  toSigner,
  type PrincipalSigner,
  type Principal,
  type Scope,
} from "@kya/core";
import { dataDir } from "./store";
const globals = globalThis as typeof globalThis & {
  kyaSigner?: Promise<PrincipalSigner>;
};
/** Principal 서명 키. 서버 시작 시 `data/principal-key.json`에 만들고 재시작해도 같은 키를 쓴다. */
export function signer() {
  return (globals.kyaSigner ??= loadOrCreatePrincipalKey(
    path.join(dataDir, "principal-key.json"),
  ).then(toSigner));
}
export function publicOrigin() {
  const host = process.env.PUBLIC_HOST || "localhost:3000";
  return host.includes("://")
    ? new URL(host).origin
    : `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"}://${host}`;
}
/** did:web 호스트(포트 포함). `did:web:` 식별자로 바꾸는 인코딩은 core가 맡는다. */
export function publicHost() {
  return new URL(publicOrigin()).host;
}
export function principalDidFor(principalId: string) {
  return principalDid(publicHost(), principalId);
}
export async function didDocument(principalId?: string) {
  const { publicJwk, kid } = await signer();
  const did = principalId
    ? principalDidFor(principalId)
    : hostDid(publicHost());
  return buildDidDocument(did, publicJwk, kid);
}
export async function issue(
  principal: Principal,
  address: string,
  sandboxId: string,
  scope: Scope,
) {
  const { delegation, claims } = await issueDelegation({
    signer: await signer(),
    principal,
    address,
    sandboxId,
    scope,
  });
  return {
    token: delegation,
    jti: claims.jti,
    exp: claims.exp,
    scope,
    fundingStatus: "pending" as const,
  };
}
