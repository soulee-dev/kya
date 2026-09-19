// Environment injected by A's `POST /sandboxes` (docs/04-contract.md 접점 4).
// KYA_URL is optional so the runner can be exercised against a bare Merchant locally.
export const config = {
  kyaUrl: trimSlash(process.env.KYA_URL),
  merchantUrl: trimSlash(process.env.MERCHANT_URL) ?? "http://localhost:5050",
  sandboxId: process.env.SANDBOX_ID ?? "local",
  shoppingList: (process.env.SHOPPING_LIST ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  rpcUrl: process.env.BASE_SEPOLIA_RPC ?? "https://sepolia.base.org",
  // Local testing only: reuse a funded key instead of generating one per boot.
  privateKey: process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined,
  model: process.env.CLAUDE_MODEL ?? "claude-opus-5",
  pollMs: 2000,
};

export const NETWORK = "eip155:84532" as const;
export const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

function trimSlash(v: string | undefined) {
  return v ? v.replace(/\/+$/, "") : undefined;
}

export function usdc(atomic: string | bigint) {
  return (Number(atomic) / 1e6).toFixed(2) + " USDC";
}
