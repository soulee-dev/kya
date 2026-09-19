// KYA Agent runner — runs inside a Daytona sandbox (docs/04-contract.md 접점 4).
// Boot: keygen → register → poll delegation → wait USDC → shop (SHOPPING_LIST, then chat commands).
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createPublicClient, http, erc20Abi } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { x402Client, wrapFetchWithPayment } from "@x402/fetch";
import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";

const env = (k: string, d?: string) => process.env[k] ?? d;
const KYA_URL = env("KYA_URL")?.replace(/\/$/, "");
const MERCHANT_URL = (env("MERCHANT_URL", "http://localhost:5050") as string).replace(/\/$/, "");
const SANDBOX_ID = env("SANDBOX_ID", "local");
const SHOPPING_LIST = env("SHOPPING_LIST");
const MODEL = env("ANTHROPIC_MODEL", "claude-sonnet-5") as string;
const RPC = env("BASE_SEPOLIA_RPC", "https://sepolia.base.org") as string;
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
const NETWORK = "eip155:84532";

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── 1. wallet: key is born here and never leaves the sandbox (D6) ──────────
const account = privateKeyToAccount((env("AGENT_PRIVATE_KEY") as `0x${string}`) ?? generatePrivateKey());
const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC) });
log(`agent address ${account.address} sandbox=${SANDBOX_ID}`);

let delegation: string | undefined = env("KYA_DELEGATION");

async function reportToKya(step: string, message: string) {
  if (!KYA_URL) return;
  await fetch(`${KYA_URL}/agents/${account.address}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ step, message }),
  }).catch(() => {});
}

// ── 2–4. register, wait for delegation, wait for funding ───────────────────
async function bootWithKya() {
  if (!KYA_URL) {
    log("KYA_URL not set → local mode (no register/poll)");
    return;
  }
  await fetch(`${KYA_URL}/agents/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sandboxId: SANDBOX_ID, address: account.address }),
  });
  log("registered; waiting for delegation…");
  while (!delegation) {
    const r = await fetch(`${KYA_URL}/agents/${account.address}/delegation`).catch(() => undefined);
    if (r?.ok) delegation = ((await r.json()) as { delegation: string }).delegation;
    else await sleep(2000);
  }
  log("delegation received");
  await reportToKya("delegation", "Delegation received");
}

async function waitForFunding() {
  if (env("SKIP_FUNDING")) return;
  log("waiting for USDC balance…");
  for (;;) {
    const bal = (await publicClient
      .readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [account.address] })
      .catch(() => 0n)) as bigint;
    if (bal > 0n) {
      log(`funded: ${Number(bal) / 1e6} USDC`);
      await reportToKya("funded", `${Number(bal) / 1e6} USDC`);
      return;
    }
    await sleep(2000);
  }
}

// ── x402 client: signs EIP-3009 and echoes extensions.kya with the delegation ─
const x402 = new x402Client()
  .setSpendControls(false) // the Delegation, not the client, is the spend limit
  .register(NETWORK, new ExactEvmScheme(toClientEvmSigner(account, publicClient)))
  .registerExtension({
    key: "kya",
    enrichPaymentPayload: async (payload, required) => {
      const advertised = (required.extensions?.kya ?? {}) as { info?: Record<string, unknown>; schema?: unknown };
      return {
        ...payload,
        extensions: {
          ...(payload.extensions ?? {}),
          kya: { ...advertised, info: { ...(advertised.info ?? {}), delegation } },
        },
      };
    },
  });
const fetchWithPay = wrapFetchWithPayment(fetch, x402);

// ── merchant helpers ───────────────────────────────────────────────────────
type Product = { id: string; title: string; brand: string; priceKRW: number; priceUSDC: string; category: string; url: string; imageUrl: string };
type Checkout = { id: string; status: string; total: string; order?: { id: string; tx?: string } };

const mj = (r: Response) => r.json() as Promise<any>;
async function searchProducts(q: string): Promise<Product[]> {
  const u = new URL(`${MERCHANT_URL}/products`);
  u.searchParams.set("q", q);
  u.searchParams.set("limit", "8");
  return (await mj(await fetch(u))).products;
}
async function createCheckout(productId: string, commandId?: string): Promise<Checkout> {
  const r = await fetch(`${MERCHANT_URL}/checkout-sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ line_items: [{ item: { id: productId }, quantity: 1 }], command_id: commandId }),
  });
  if (!r.ok) throw new Error(`create_checkout ${r.status}: ${await r.text()}`);
  return mj(r);
}
// Returns a human-readable outcome; the KYA reject code comes back as the 402's `error`.
async function completeCheckout(sessionId: string): Promise<{ ok: boolean; reason: string; tx?: string }> {
  const r = await fetchWithPay(`${MERCHANT_URL}/checkout-sessions/${sessionId}/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }).catch((e: Error) => e);
  if (r instanceof Error) return { ok: false, reason: r.message };
  if (r.status === 402) {
    const h = r.headers.get("payment-required");
    const reason = h ? (decodePaymentRequiredHeader(h).error ?? "payment_required") : await r.text();
    return { ok: false, reason };
  }
  if (!r.ok) return { ok: false, reason: `${r.status} ${await r.text()}` };
  const pr = r.headers.get("payment-response");
  const tx = pr ? decodePaymentResponseHeader(pr).transaction : undefined;
  return { ok: true, reason: "settled", tx };
}

// ── LLM shopping loop ──────────────────────────────────────────────────────
const anthropic = new Anthropic();
const SYSTEM = `당신은 여성 고객을 위한 개인 쇼핑 에이전트입니다. 상점의 상품을 검색해 고객 요청(예산, 용도, 취향)에 가장 잘 맞는 하나를 고르고, recommend로 이유를 알린 뒤 체크아웃을 만들고 결제까지 완료합니다.
규칙:
- 검색은 1~3개의 짧은 한국어 키워드로, 필요하면 여러 번 하세요 (예: "자켓", "트위드 자켓", "가방").
- 가격은 priceKRW(원)로 판단하세요. 고객이 예산을 말하면 그 안에서 고르세요.
- 결제는 KYA Verifier가 위임 한도를 검사합니다. 거절되면(kya:per_tx_limit_exceeded 등) 이유를 고객에게 설명하고, 더 싼 대안이 있으면 한 번만 다시 시도하세요.
- 상품 ID가 직접 주어지면(예: "A, B, C") 검색 없이 그 순서대로 하나씩 구매하고 거절돼도 다음으로 넘어가세요.
- 마지막에 고객에게 보내는 2~3문장의 다정한 한국어 요약을 작성하세요. 구매한 상품명, 가격, 승인/거절 이유를 포함하세요.`;

async function shop(text: string, commandId?: string) {
  const emit = async (step: string, message: string, data?: unknown) => {
    log(`[${step}] ${message}`);
    await reportToKya(step, message);
    if (commandId)
      await fetch(`${MERCHANT_URL}/commands/${commandId}/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step, message, data }),
      }).catch(() => {});
  };
  const result = { outcome: "not_found" as "purchased" | "denied" | "not_found" | "error", checkoutId: undefined as string | undefined, productId: undefined as string | undefined };

  const tools = [
    betaZodTool({
      name: "search_products",
      description: "상점 카탈로그에서 키워드로 상품을 검색합니다. 최대 8개 반환.",
      inputSchema: z.object({ query: z.string().describe("짧은 한국어 키워드") }),
      run: async ({ query }) => {
        await emit("search", `"${query}" 검색 중…`);
        const list = await searchProducts(query);
        await emit("search", `${list.length}개 후보 발견`, { products: list.slice(0, 4) });
        return JSON.stringify(list.map(({ id, title, brand, priceKRW, category }) => ({ id, title, brand, priceKRW, category })));
      },
    }),
    betaZodTool({
      name: "recommend",
      description: "고객에게 최종 추천 상품과 이유를 알립니다. 체크아웃 전에 반드시 호출.",
      inputSchema: z.object({ productId: z.string(), reason: z.string().describe("한 문장, 한국어") }),
      run: async ({ productId, reason }) => {
        const p = await mj(await fetch(`${MERCHANT_URL}/products/${productId}`)).catch(() => null);
        result.productId = productId;
        await emit("recommend", reason, { product: p });
        return "ok";
      },
    }),
    betaZodTool({
      name: "create_checkout",
      description: "상품 하나로 UCP 체크아웃 세션을 만듭니다. sessionId를 반환.",
      inputSchema: z.object({ productId: z.string() }),
      run: async ({ productId }) => {
        const co = await createCheckout(productId, commandId);
        result.checkoutId = co.id;
        result.productId = productId;
        return JSON.stringify({ sessionId: co.id, totalUSDC: Number(co.total) / 1e6, status: co.status });
      },
    }),
    betaZodTool({
      name: "complete_checkout",
      description: "체크아웃을 x402 결제로 완료합니다. KYA Verifier가 위임 범위를 검사해 승인/거절합니다.",
      inputSchema: z.object({ sessionId: z.string() }),
      run: async ({ sessionId }) => {
        await emit("pay", "결제 서명 → Verifier 검사 중…");
        const r = await completeCheckout(sessionId);
        result.outcome = r.ok ? "purchased" : "denied";
        await emit("pay", r.ok ? `결제 완료 ${r.tx ? "tx " + r.tx.slice(0, 10) + "…" : ""}` : `결제 거절: ${r.reason}`, r);
        return JSON.stringify(r);
      },
    }),
  ];

  await emit("think", `요청 분석 중: "${text}"`);
  try {
    const runner = anthropic.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 1200,
      output_config: { effort: "low" },
      system: SYSTEM,
      messages: [{ role: "user", content: text }],
      tools,
      max_iterations: 12,
    });
    const final = await runner.runUntilDone();
    const summary = final.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
    await emit("done", summary || "완료");
    if (commandId)
      await fetch(`${MERCHANT_URL}/commands/${commandId}/done`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ result: { ...result, message: summary } }),
      }).catch(() => {});
  } catch (e) {
    const msg = (e as Error).message;
    await emit("error", msg);
    if (commandId)
      await fetch(`${MERCHANT_URL}/commands/${commandId}/done`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ result: { ...result, outcome: "error", message: msg } }),
      }).catch(() => {});
  }
}

// ── main ───────────────────────────────────────────────────────────────────
await bootWithKya();
await waitForFunding();

if (SHOPPING_LIST) {
  await shop(`다음 상품 ID를 순서대로 하나씩 구매해줘: ${SHOPPING_LIST}`);
}

log(`polling ${MERCHANT_URL}/commands/next for chat commands…`);
for (;;) {
  const r = await fetch(`${MERCHANT_URL}/commands/next`).catch(() => undefined);
  if (r?.status === 200) {
    const cmd = (await r.json()) as { id: string; text: string };
    await shop(cmd.text, cmd.id);
  } else {
    await sleep(2000);
  }
}
