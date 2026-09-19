export const NETWORK = "eip155:84532";
export const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export type Scope = {
  network: string;
  asset: string;
  perTxLimit: string;
  cumulativeLimit: string;
  merchants: string[];
};
export type Principal = {
  principalId: string;
  did: string;
  entityType: "person" | "business";
  name: string;
  verifiedAt: string;
};
export type AppState = {
  principal: Principal | null;
  sandbox: { sandboxId: string; simulated: boolean } | null;
  agent: { address: string; funded: boolean } | null;
  delegation: {
    jti: string;
    scope: Scope;
    exp: number;
    token: string;
    fundingTx?: string;
    fundingStatus: "pending" | "confirmed" | "simulated";
  } | null;
  events: { at: string; step: string; message: string }[];
};
export type Decision = {
  at: string;
  jti: string;
  payer: string;
  payTo: string;
  amount: string;
  decision: "approved" | "denied";
  reason?: string;
  txHash?: string;
};
export type PublicState = Omit<AppState, "delegation"> & {
  delegation: Omit<NonNullable<AppState["delegation"]>, "token"> | null;
  demo: boolean;
  merchantPayTo: string;
};
