import path from "node:path";
import { readFile } from "node:fs/promises";
import {
  createSandboxLauncher,
  createTreasury,
  DEFAULT_FUNDING_AMOUNT,
} from "@kya/core";
import type { Hex } from "viem";
import { publicOrigin } from "./identity";
export const demoMode = () => process.env.WEB_DEMO_MODE === "true";
export async function createSandbox() {
  if (demoMode())
    return {
      sandboxId: `local-${crypto.randomUUID().slice(0, 8)}`,
      simulated: true,
    };
  for (const key of [
    "DAYTONA_API_KEY",
    "ANTHROPIC_API_KEY",
    "RUNNER_DIR",
    "PUBLIC_HOST",
    "MERCHANT_URL",
  ]) {
    if (!process.env[key]) throw new Error(`${key} 환경 변수가 필요합니다.`);
  }
  const runnerDir = path.resolve(process.env.RUNNER_DIR!);
  await readFile(path.join(runnerDir, "package.json"), "utf8");
  const launcher = createSandboxLauncher({
    apiKey: process.env.DAYTONA_API_KEY,
    apiUrl: process.env.DAYTONA_API_URL,
    target: process.env.DAYTONA_TARGET,
    runnerDir,
    runCommand: process.env.RUNNER_COMMAND,
  });
  // 계약 접점 4의 환경 변수. SANDBOX_ID는 생성 뒤 core가 주입한다.
  const { sandboxId } = await launcher.launch({
    KYA_URL: publicOrigin(),
    MERCHANT_URL: process.env.MERCHANT_URL!,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
    SHOPPING_LIST: process.env.SHOPPING_LIST || "A,B,C,C",
  });
  return { sandboxId, simulated: false };
}
function treasury() {
  if (!process.env.TREASURY_PRIVATE_KEY)
    throw new Error("TREASURY_PRIVATE_KEY 환경 변수가 필요합니다.");
  return createTreasury({
    privateKey: process.env.TREASURY_PRIVATE_KEY as Hex,
    rpcUrl: process.env.BASE_SEPOLIA_RPC,
  });
}
/** Agent 지갑에 USDC를 보내고 tx hash를 돌려준다. 영수증은 `confirmFunding`으로 확인한다. */
export function sendFunding(address: string) {
  return treasury().send(
    address as Hex,
    process.env.FUNDING_AMOUNT || DEFAULT_FUNDING_AMOUNT,
  );
}
export function confirmFunding(hash: string) {
  return treasury().confirm(hash as Hex);
}
