import { exportJWK, generateKeyPair, importJWK, type JWK, type CryptoKey } from "jose";
import { readJsonFile, writeJsonFile } from "./store";

export interface PrincipalKeyFile {
  kid: string;
  alg: "EdDSA";
  publicJwk: JWK;
  privateJwk: JWK;
  createdAt: string;
}

export interface PrincipalSigner {
  kid: string;
  publicJwk: JWK;
  privateKey: CryptoKey;
}

export async function generatePrincipalKey(kid = "key-1"): Promise<PrincipalKeyFile> {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  const publicJwk = { ...(await exportJWK(publicKey)), kid, alg: "EdDSA", use: "sig" } as JWK;
  const privateJwk = { ...(await exportJWK(privateKey)), kid, alg: "EdDSA" } as JWK;
  return { kid, alg: "EdDSA", publicJwk, privateJwk, createdAt: new Date().toISOString() };
}

export async function toSigner(file: PrincipalKeyFile): Promise<PrincipalSigner> {
  const privateKey = (await importJWK(file.privateJwk, "EdDSA")) as CryptoKey;
  return { kid: file.kid, publicJwk: file.publicJwk, privateKey };
}

/** 파일이 있으면 읽고, 없으면 만들어 저장한다. 재시작해도 같은 키를 쓴다. */
export async function loadOrCreatePrincipalKey(path: string): Promise<PrincipalKeyFile> {
  const existing = readJsonFile<PrincipalKeyFile>(path);
  if (existing?.privateJwk) return existing;
  const created = await generatePrincipalKey();
  writeJsonFile(path, created);
  return created;
}
