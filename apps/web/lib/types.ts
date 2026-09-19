// 브라우저에서도 읽는 파일이다. Node 전용 모듈이 섞이지 않도록 core의 types 서브패스만 쓴다.
import type {
  Decision as CoreDecision,
  Principal,
  Scope,
} from "@kya/core/types";
import { NETWORK, USDC_ASSET } from "@kya/core/types";
export { NETWORK };
export const USDC = USDC_ASSET;
export type { Principal, Scope };
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
/** Verifier `GET /decisions` 항목. 형식은 core의 판정 카드를 따른다. */
export type Decision = CoreDecision;
export type PublicState = Omit<AppState, "delegation"> & {
  delegation: Omit<NonNullable<AppState["delegation"]>, "token"> | null;
  demo: boolean;
  merchantPayTo: string;
};
