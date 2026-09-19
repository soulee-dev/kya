import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  erc20Abi,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { publicOrigin } from "./identity";
import { USDC } from "./types";
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
  const root = path.resolve(process.env.RUNNER_DIR!);
  await readFile(path.join(root, "package.json"), "utf8");
  const { Daytona } = await import("@daytona/sdk");
  const sandbox = await new Daytona().create({
    language: "typescript",
    envVars: {
      KYA_URL: publicOrigin(),
      MERCHANT_URL: process.env.MERCHANT_URL!,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY!,
      SHOPPING_LIST: "A,B,C,C",
    },
    labels: { app: "kya" },
    autoStopInterval: 60,
    public: false,
  });
  try {
    const destination = "/home/daytona/kya-runner";
    const upload = async (local: string, remote: string) => {
      await sandbox.fs.createFolder(remote, "755");
      for (const entry of await readdir(local, { withFileTypes: true })) {
        if (
          ["node_modules", ".git", ".next"].includes(entry.name) ||
          entry.name.startsWith(".env")
        )
          continue;
        if (entry.isDirectory())
          await upload(path.join(local, entry.name), `${remote}/${entry.name}`);
        else if (entry.isFile())
          await sandbox.fs.uploadFile(
            await readFile(path.join(local, entry.name)),
            `${remote}/${entry.name}`,
          );
      }
    };
    await upload(root, destination);
    const install = await sandbox.process.executeCommand(
      "corepack enable && pnpm install --no-frozen-lockfile",
      destination,
      undefined,
      120,
    );
    if (install.exitCode !== 0)
      throw new Error("Agent 러너 의존성 설치에 실패했습니다.");
    // Bootstrap carries SANDBOX_ID, which is only known after creation, without shell interpolation.
    await sandbox.fs.uploadFile(
      Buffer.from(
        `const {spawn}=require('node:child_process');\nconst child=spawn(${JSON.stringify(process.env.RUNNER_COMMAND || "pnpm start")},{shell:true,stdio:'inherit',env:{...process.env,SANDBOX_ID:${JSON.stringify(sandbox.id)}}});\nchild.on('exit',code=>process.exit(code??1));`,
      ),
      `${destination}/kya-bootstrap.cjs`,
    );
    const start = await sandbox.process.executeCommand(
      "nohup node kya-bootstrap.cjs > /tmp/kya-runner.log 2>&1 < /dev/null &",
      destination,
      undefined,
      10,
    );
    if (start.exitCode !== 0)
      throw new Error("Agent 러너 실행에 실패했습니다.");
    return { sandboxId: sandbox.id, simulated: false };
  } catch (error) {
    await sandbox.delete().catch(() => undefined);
    throw error;
  }
}
export async function sendFunding(address: string): Promise<Hex> {
  if (!process.env.TREASURY_PRIVATE_KEY)
    throw new Error("TREASURY_PRIVATE_KEY 환경 변수가 필요합니다.");
  const account = privateKeyToAccount(process.env.TREASURY_PRIVATE_KEY as Hex);
  const wallet = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org"),
  });
  return wallet.writeContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "transfer",
    args: [address as Address, 20000000n],
  });
}
export async function confirmFunding(hash: string) {
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org"),
  });
  const receipt = await client.waitForTransactionReceipt({
    hash: hash as Hex,
    timeout: 60_000,
  });
  if (receipt.status !== "success")
    throw new Error("USDC 충전 트랜잭션이 되돌려졌습니다.");
}
