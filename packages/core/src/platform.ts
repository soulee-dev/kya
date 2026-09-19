import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Hex } from "viem";
import { buildDidDocument, hostDid, principalDid, type DidDocument } from "./did.js";
import { issueDelegation } from "./delegation.js";
import type { Treasury } from "./funding.js";
import { loadOrCreatePrincipalKey, toSigner, type PrincipalSigner } from "./keys.js";
import type { SandboxLauncher } from "./sandbox.js";
import { JsonState } from "./store.js";
import {
  DEFAULT_DELEGATION_TTL_SECONDS,
  DEFAULT_FUNDING_AMOUNT,
  NETWORK,
  USDC_ASSET,
  type AgentEvent,
  type AgentRecord,
  type DelegationRecord,
  type EntityType,
  type Principal,
  type SandboxRecord,
  type Scope,
} from "./types.js";

export interface PlatformOptions {
  /** did:web 호스트 (터널 호스트). 예: kya.example.com, localhost:4001 */
  host: string;
  dataDir: string;
  /** 없으면 발급 시 충전을 건너뛴다(fundingTx 없음). */
  treasury?: Treasury;
  fundingAmount?: string;
  /** 없으면 POST /sandboxes 는 가짜 sandbox id를 만든다. */
  sandboxes?: SandboxLauncher;
  runnerEnv?: { MERCHANT_URL: string; ANTHROPIC_API_KEY: string; SHOPPING_LIST?: string; KYA_URL: string };
  delegationTtlSeconds?: number;
  now?: () => Date;
}

export interface VerifyIdentityInput {
  entityType: EntityType;
  name: string;
  registrationNumber?: string;
}

export interface IssueInput {
  principalId: string;
  address: string;
  scope: Partial<Scope> & { perTxLimit: string; cumulativeLimit: string; merchants: string[] };
  ttlSeconds?: number;
}

export interface PlatformState {
  principals: Record<string, Principal>;
  sandboxes: Record<string, SandboxRecord>;
  agents: Record<string, AgentRecord>;
  delegations: Record<string, DelegationRecord>; // key = agent address
  events: AgentEvent[];
}

export interface StateView {
  principal: Principal | null;
  sandbox: SandboxRecord | null;
  agent: { address: string; sandboxId: string; funded: boolean; fundingTx?: string } | null;
  delegation: { jti: string; scope: Scope; iat: number; exp: number; delegation: string } | null;
  events: AgentEvent[];
}

export interface Platform {
  readonly did: string;
  didDocument(): DidDocument;
  verifyIdentity(input: VerifyIdentityInput): Promise<Principal>;
  getPrincipal(id: string): Principal | undefined;
  createSandbox(): Promise<{ sandboxId: string }>;
  registerAgent(input: { sandboxId: string; address: string }): AgentRecord;
  getDelegation(address: string): DelegationRecord | undefined;
  issueDelegation(input: IssueInput): Promise<DelegationRecord>;
  recordEvent(address: string, input: { step: string; message: string }): AgentEvent;
  state(): StateView;
  sandboxLogs(sandboxId: string): Promise<string>;
}

class PlatformError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "PlatformError";
  }
}
export { PlatformError };

/** 발급 쪽 핵심: 신원 확인 스텁 → DID·키 → 샌드박스 → Agent 등록 → Delegation 발급 + 충전. */
export async function createPlatform(opts: PlatformOptions): Promise<Platform> {
  const now = opts.now ?? (() => new Date());
  const did = hostDid(opts.host);
  const keyFile = await loadOrCreatePrincipalKey(join(opts.dataDir, "principal-key.json"));
  const signer: PrincipalSigner = await toSigner(keyFile);
  const state = new JsonState<PlatformState>(join(opts.dataDir, "platform.json"), () => ({
    principals: {},
    sandboxes: {},
    agents: {},
    delegations: {},
    events: [],
  }));

  const latest = <T extends object>(map: Record<string, T>, key: keyof T): T | null => {
    const list = Object.values(map);
    if (list.length === 0) return null;
    return [...list].sort((a, b) => String(b[key]).localeCompare(String(a[key])))[0];
  };

  return {
    did,

    didDocument() {
      return buildDidDocument(did, signer.publicJwk, signer.kid);
    },

    async verifyIdentity(input) {
      if (!input?.name || (input.entityType !== "person" && input.entityType !== "business")) {
        throw new PlatformError(400, "entityType(person|business)와 name이 필요합니다");
      }
      if (input.entityType === "business" && !input.registrationNumber) {
        throw new PlatformError(400, "business는 registrationNumber가 필요합니다");
      }
      // 신원 확인 스텁: 항상 확인됨. 실제 KYC/KYB 사업자 연동 자리.
      const principalId = randomUUID().slice(0, 8);
      const principal: Principal = {
        principalId,
        did: principalDid(opts.host, principalId),
        entityType: input.entityType,
        name: input.name,
        ...(input.registrationNumber ? { registrationNumber: input.registrationNumber } : {}),
        verifiedAt: now().toISOString(),
      };
      state.update((s) => {
        s.principals[principalId] = principal;
      });
      return principal;
    },

    getPrincipal(id) {
      return state.get().principals[id];
    },

    async createSandbox() {
      let sandboxId: string;
      if (opts.sandboxes && opts.runnerEnv) {
        const r = await opts.sandboxes.launch({
          KYA_URL: opts.runnerEnv.KYA_URL,
          MERCHANT_URL: opts.runnerEnv.MERCHANT_URL,
          ANTHROPIC_API_KEY: opts.runnerEnv.ANTHROPIC_API_KEY,
          SHOPPING_LIST: opts.runnerEnv.SHOPPING_LIST ?? "A,B,C,C",
        });
        sandboxId = r.sandboxId;
      } else {
        sandboxId = `local-${randomUUID().slice(0, 8)}`;
      }
      state.update((s) => {
        s.sandboxes[sandboxId] = { sandboxId, createdAt: now().toISOString() };
      });
      return { sandboxId };
    },

    registerAgent(input) {
      const address = normalizeAddress(input?.address);
      if (!address || !input?.sandboxId) throw new PlatformError(400, "sandboxId와 address(0x…)가 필요합니다");
      const rec: AgentRecord = { address, sandboxId: input.sandboxId, registeredAt: now().toISOString() };
      state.update((s) => {
        s.agents[address] = rec;
        if (!s.sandboxes[input.sandboxId]) s.sandboxes[input.sandboxId] = { sandboxId: input.sandboxId, createdAt: rec.registeredAt };
      });
      return rec;
    },

    getDelegation(address) {
      const a = normalizeAddress(address);
      return a ? state.get().delegations[a] : undefined;
    },

    async issueDelegation(input) {
      const principal = state.get().principals[input?.principalId];
      if (!principal) throw new PlatformError(404, "principal을 찾을 수 없습니다");
      const address = normalizeAddress(input.address);
      if (!address) throw new PlatformError(400, "address(0x…)가 필요합니다");
      const agent = state.get().agents[address];
      const sandboxId = agent?.sandboxId ?? "unregistered";
      const merchants = (input.scope?.merchants ?? []).map(normalizeAddress).filter((m): m is string => !!m);
      if (merchants.length === 0) throw new PlatformError(400, "scope.merchants에 payTo 주소가 최소 1개 필요합니다");
      for (const [k, v] of [["perTxLimit", input.scope?.perTxLimit], ["cumulativeLimit", input.scope?.cumulativeLimit]] as const) {
        if (!/^\d+$/.test(String(v ?? ""))) throw new PlatformError(400, `scope.${k}는 atomic units 정수 문자열이어야 합니다`);
      }
      const scope: Scope = {
        network: input.scope.network ?? NETWORK,
        asset: input.scope.asset ?? USDC_ASSET,
        perTxLimit: input.scope.perTxLimit,
        cumulativeLimit: input.scope.cumulativeLimit,
        merchants,
      };
      const issued = await issueDelegation({
        signer,
        principal,
        address,
        sandboxId,
        scope,
        ttlSeconds: input.ttlSeconds ?? opts.delegationTtlSeconds ?? DEFAULT_DELEGATION_TTL_SECONDS,
        now: now(),
      });
      let fundingTx: string | undefined;
      if (opts.treasury) {
        fundingTx = await opts.treasury.fund(address as Hex, opts.fundingAmount ?? DEFAULT_FUNDING_AMOUNT);
      }
      const rec: DelegationRecord = {
        jti: issued.claims.jti,
        address,
        principalId: principal.principalId,
        sandboxId,
        scope,
        iat: issued.claims.iat,
        exp: issued.claims.exp,
        delegation: issued.delegation,
        ...(fundingTx ? { fundingTx } : {}),
      };
      state.update((s) => {
        s.delegations[address] = rec;
      });
      return rec;
    },

    recordEvent(address, input) {
      const a = normalizeAddress(address) ?? address;
      if (!input?.step) throw new PlatformError(400, "step이 필요합니다");
      const ev: AgentEvent = { at: now().toISOString(), address: a, step: String(input.step), message: String(input.message ?? "") };
      state.update((s) => {
        s.events.push(ev);
        if (s.events.length > 1000) s.events.splice(0, s.events.length - 1000);
      });
      return ev;
    },

    state() {
      const s = state.get();
      const principal = latest(s.principals, "verifiedAt");
      const sandbox = latest(s.sandboxes, "createdAt");
      const agentRec = latest(s.agents, "registeredAt");
      const delegation = agentRec ? s.delegations[agentRec.address] ?? null : null;
      return {
        principal,
        sandbox,
        agent: agentRec
          ? { address: agentRec.address, sandboxId: agentRec.sandboxId, funded: !!delegation?.fundingTx, fundingTx: delegation?.fundingTx }
          : null,
        delegation: delegation
          ? { jti: delegation.jti, scope: delegation.scope, iat: delegation.iat, exp: delegation.exp, delegation: delegation.delegation }
          : null,
        events: agentRec ? s.events.filter((e) => e.address === agentRec.address) : s.events,
      };
    },

    async sandboxLogs(sandboxId) {
      if (!opts.sandboxes) return "";
      return opts.sandboxes.logs(sandboxId);
    },
  };
}

function normalizeAddress(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(s) ? s : undefined;
}
