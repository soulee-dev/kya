import { createPublicClient, http, erc20Abi, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { config, USDC } from "./config.js";

// ── KYA platform (A) ──────────────────────────────────────────────────────
// Every call is a no-op when KYA_URL is unset so the runner still works standalone.

export async function registerAgent(address: Address) {
  if (!config.kyaUrl) return;
  const r = await fetch(`${config.kyaUrl}/agents/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sandboxId: config.sandboxId, address }),
  });
  if (!r.ok) throw new Error(`register failed: ${r.status} ${await r.text()}`);
}

// 접점 4.3 — poll until the Principal issues a Delegation.
export async function waitForDelegation(address: Address): Promise<string | undefined> {
  if (!config.kyaUrl) return undefined;
  for (;;) {
    const r = await fetch(`${config.kyaUrl}/agents/${address}/delegation`).catch(() => undefined);
    if (r?.ok) {
      const { delegation } = (await r.json()) as { delegation: string };
      if (delegation) return delegation;
    }
    await sleep(config.pollMs);
  }
}

export async function reportEvent(address: Address, step: string, message: string) {
  if (!config.kyaUrl) return;
  await fetch(`${config.kyaUrl}/agents/${address}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ step, message }),
  }).catch(() => undefined);
}

// ── chain ─────────────────────────────────────────────────────────────────
const chain = createPublicClient({ chain: baseSepolia, transport: http(config.rpcUrl) });

export async function usdcBalance(address: Address): Promise<bigint> {
  return chain.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] });
}

// 접점 4.4 — A funds the wallet right after issuing; block until it lands.
export async function waitForFunding(address: Address): Promise<bigint> {
  for (;;) {
    const bal = await usdcBalance(address).catch(() => 0n);
    if (bal > 0n) return bal;
    await sleep(3000);
  }
}

// Unverified decode — only to show the model its own limits. The Verifier does the real check.
export function decodeDelegation(jwt: string) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
    const scope = payload?.vc?.credentialSubject?.scope ?? {};
    return {
      jti: payload.jti as string,
      exp: payload.exp as number,
      principal: payload?.vc?.credentialSubject?.principal?.name as string | undefined,
      perTxLimit: scope.perTxLimit as string | undefined,
      cumulativeLimit: scope.cumulativeLimit as string | undefined,
      merchants: (scope.merchants ?? []) as string[],
    };
  } catch {
    return undefined;
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
