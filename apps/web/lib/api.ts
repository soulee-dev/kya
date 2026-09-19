import { z } from "zod";
import { getAddress, isAddress } from "viem";
import { didHost, issue } from "./identity";
import { exclusive, readState, writeState, event } from "./store";
import {
  confirmFunding,
  createSandbox,
  demoMode,
  sendFunding,
} from "./integrations";
import { NETWORK, USDC } from "./types";
const address = z
  .string()
  .refine(isAddress, "유효한 EVM 주소를 입력해 주세요.")
  .transform((value) => getAddress(value));
const atomic = z
  .string()
  .regex(/^[1-9]\d{0,29}$/, "한도는 양의 atomic units 문자열이어야 합니다.");
const scopeSchema = z
  .object({
    network: z.literal(NETWORK),
    asset: z.string().refine((v) => v.toLowerCase() === USDC.toLowerCase()),
    perTxLimit: atomic,
    cumulativeLimit: atomic,
    merchants: z.array(address).min(1).max(30),
  })
  .refine(
    (v) => BigInt(v.perTxLimit) <= BigInt(v.cumulativeLimit),
    "누적 한도는 1회 한도 이상이어야 합니다.",
  );
class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function handle(request: Request, segments: string[]) {
  const route = segments.join("/");
  try {
    if (request.method === "GET") {
      const state = await readState();
      if (route === "state") {
        const delegation = state.delegation
          ? (({ token: _, ...rest }) => rest)(state.delegation)
          : null;
        return json({
          ...state,
          delegation,
          demo: demoMode(),
          merchantPayTo: process.env.MERCHANT_PAYTO || "",
        });
      }
      if (segments[0] === "agents" && segments[2] === "delegation") {
        const agentAddress = address.parse(segments[1]);
        if (
          state.agent?.address !== agentAddress ||
          !state.delegation ||
          state.delegation.fundingStatus === "pending"
        )
          throw new ApiError("아직 발급되지 않았습니다.", 404);
        if (state.delegation.exp <= Date.now() / 1000)
          throw new ApiError("위임이 만료되었습니다.", 404);
        return json({ delegation: state.delegation.token });
      }
      if (
        route === "verifier/decisions" ||
        (segments[0] === "verifier" &&
          segments[1] === "ledger" &&
          segments.length === 3)
      ) {
        const base = process.env.VERIFIER_URL;
        if (!base)
          throw new ApiError("Verifier 연결을 기다리고 있습니다.", 503);
        const response = await fetch(
          `${base.replace(/\/$/, "")}/${segments.slice(1).map(encodeURIComponent).join("/")}`,
          { cache: "no-store", signal: AbortSignal.timeout(3000) },
        );
        if (!response.ok)
          throw new ApiError(`Verifier 응답 오류 (${response.status})`, 502);
        return json(await response.json());
      }
      throw new ApiError("찾을 수 없는 경로입니다.", 404);
    }
    if (request.method !== "POST")
      throw new ApiError("지원하지 않는 메서드입니다.", 405);
    // Browser writes are same-origin. Runner callbacks have no Origin header.
    const origin = request.headers.get("origin");
    if (
      origin &&
      new URL(origin).host !== new URL(request.url).host &&
      new URL(origin).host !== request.headers.get("host")
    )
      throw new ApiError("다른 출처의 요청은 허용되지 않습니다.", 403);
    const body = await request.json();
    return await exclusive(async () => {
      const state = await readState();
      if (route === "principals") {
        if (state.principal)
          throw new ApiError("이미 신원 확인을 마쳤습니다.", 409);
        const input = z
          .object({
            entityType: z.enum(["person", "business"]),
            name: z.string().trim().min(2).max(100),
            registrationNumber: z.string().trim().max(40).default(""),
          })
          .parse(body);
        if (
          input.entityType === "business" &&
          !/^\d{3}-?\d{2}-?\d{5}$/.test(input.registrationNumber)
        )
          throw new ApiError("사업자등록번호 10자리를 입력해 주세요.");
        const principalId = crypto.randomUUID();
        state.principal = {
          principalId,
          did: `did:web:${didHost()}:principals:${principalId}`,
          entityType: input.entityType,
          name: input.name,
          verifiedAt: new Date().toISOString(),
        };
        event(state, "identity", `${input.name} · 신원 확인 완료 (데모 스텁)`);
        await writeState(state);
        return json(state.principal, 201);
      }
      if (route === "sandboxes") {
        if (!state.principal)
          throw new ApiError("먼저 신원 확인을 완료해 주세요.");
        if (state.sandbox) return json(state.sandbox);
        state.sandbox = await createSandbox();
        event(
          state,
          "sandbox",
          state.sandbox.simulated
            ? "로컬 데모 샌드박스 준비 완료"
            : "Daytona 샌드박스 생성 · 러너 시작",
        );
        await writeState(state);
        return json(state.sandbox, 201);
      }
      if (route === "agents/register") {
        const input = z
          .object({ sandboxId: z.string().min(1), address })
          .parse(body);
        if (!state.sandbox || state.sandbox.sandboxId !== input.sandboxId)
          throw new ApiError("일치하는 샌드박스가 없습니다.", 404);
        if (state.agent && state.agent.address !== input.address)
          throw new ApiError("이 샌드박스에는 이미 Agent가 있습니다.", 409);
        if (!state.agent) {
          state.agent = { address: input.address, funded: false };
          event(state, "agent", `Agent 주소 확인 · ${input.address}`);
        }
        await writeState(state);
        return json({ address: state.agent.address });
      }
      if (segments[0] === "agents" && segments[2] === "events") {
        if (state.agent?.address !== address.parse(segments[1]))
          throw new ApiError("Agent를 찾을 수 없습니다.", 404);
        const input = z
          .object({
            step: z.string().min(1).max(80),
            message: z.string().min(1).max(2000),
          })
          .parse(body);
        event(state, input.step, input.message);
        await writeState(state);
        return json({ ok: true });
      }
      if (route === "delegations") {
        const input = z
          .object({ principalId: z.string(), address, scope: scopeSchema })
          .parse(body);
        if (
          !state.principal ||
          state.principal.principalId !== input.principalId ||
          !state.sandbox ||
          state.agent?.address !== input.address
        )
          throw new ApiError("확인된 Principal과 Agent가 필요합니다.");
        if (!state.delegation) {
          state.delegation = await issue(
            state.principal,
            input.address,
            state.sandbox.sandboxId,
            input.scope,
          );
          await writeState(state);
        }
        const delegation = state.delegation;
        if (delegation.exp <= Date.now() / 1000)
          throw new ApiError(
            "위임이 만료되었습니다. 데모 데이터를 초기화한 뒤 다시 시작해 주세요.",
            409,
          );
        if (delegation.fundingStatus === "pending") {
          if (demoMode()) delegation.fundingStatus = "simulated";
          else if (!process.env.TREASURY_PRIVATE_KEY) {
            // docs/04-contract.md 접점 4: 충전은 발표자가 Circle faucet 으로 한다. 러너가 잔액을 기다린다.
            delegation.fundingStatus = "manual";
          } else {
            if (!delegation.fundingTx) {
              delegation.fundingTx = await sendFunding(input.address);
              await writeState(state);
            }
            await confirmFunding(delegation.fundingTx);
            delegation.fundingStatus = "confirmed";
            state.agent.funded = true;
          }
          event(state, "delegation", `위임 발급 완료 · ${delegation.jti}`);
          event(
            state,
            "treasury",
            delegation.fundingStatus === "simulated"
              ? "데모 모드 · 실제 USDC 충전 없음"
              : delegation.fundingStatus === "manual"
                ? "Circle faucet(Base Sepolia)에서 Agent 주소로 USDC를 충전해 주세요"
                : "Agent 지갑에 20 USDC 충전 완료",
          );
          await writeState(state);
        }
        return json({
          delegation: delegation.token,
          jti: delegation.jti,
          fundingTx: delegation.fundingTx ?? null,
        });
      }
      throw new ApiError("찾을 수 없는 경로입니다.", 404);
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return json({ error: error.issues.map((i) => i.message).join(" ") }, 400);
    if (error instanceof SyntaxError)
      return json({ error: "유효한 JSON 본문이 필요합니다." }, 400);
    if (error instanceof ApiError)
      return json({ error: error.message }, error.status);
    console.error(
      "[kya]",
      error instanceof Error ? error.message : "unknown error",
    );
    return json(
      {
        error:
          "연결 또는 처리에 실패했습니다. 서버 환경 설정을 확인한 뒤 다시 시도해 주세요.",
      },
      503,
    );
  }
}
