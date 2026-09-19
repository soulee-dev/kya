import { readdir, readFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
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
    // Daytona Tier 1·2 sandboxes cannot reach the tunnels or any RPC (org network policy),
    // so the runner talks to localhost and we push the laptop's ports in with a chisel reverse tunnel.
    envVars: {
      KYA_URL: "http://localhost:3000",
      MERCHANT_URL: "http://localhost:5050",
      BASE_SEPOLIA_RPC: "http://localhost:8545",
      // LLM keys go through the same tunnel (scripts/egress-proxy.mjs). LLM_PROVIDER picks one.
      ...(process.env.LLM_PROVIDER ? { LLM_PROVIDER: process.env.LLM_PROVIDER } : {}),
      ...(process.env.ANTHROPIC_API_KEY
        ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL: "http://localhost:8547" }
        : {}),
      ...(process.env.OPENAI_API_KEY
        ? { OPENAI_API_KEY: process.env.OPENAI_API_KEY, OPENAI_BASE_URL: "http://localhost:8546/v1" }
        : {}),
      SHOPPING_LIST: process.env.SHOPPING_LIST || "A,B,C,C",
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
      // corepack enable needs root in the Daytona image (EACCES on /usr/bin), so use npm.
      "npm install --no-audit --no-fund",
      destination,
      undefined,
      120,
    );
    if (install.exitCode !== 0)
      throw new Error(
        `Agent 러너 의존성 설치에 실패했습니다: ${install.result.slice(-400)}`,
      );
    // Reverse tunnel server inside the sandbox (GitHub release downloads are allowed there).
    const tunnel = await sandbox.process.executeCommand(
      `curl -sL -m 60 -o /tmp/chisel.gz ${CHISEL_URL} && gunzip -f /tmp/chisel.gz && chmod +x /tmp/chisel && (nohup /tmp/chisel server -p ${CHISEL_PORT} --reverse > /tmp/chisel.log 2>&1 < /dev/null &) && sleep 1 && /tmp/chisel --version`,
      destination,
      undefined,
      90,
    );
    if (tunnel.exitCode !== 0)
      throw new Error(`터널 서버 준비에 실패했습니다: ${tunnel.result.slice(-300)}`);
    const preview = await sandbox.getPreviewLink(CHISEL_PORT);
    startTunnelClient(preview.url, preview.token);
    // Bootstrap carries SANDBOX_ID, which is only known after creation, without shell interpolation.
    await sandbox.fs.uploadFile(
      Buffer.from(
        `const {spawn}=require('node:child_process');\nconst child=spawn(${JSON.stringify(process.env.RUNNER_COMMAND || "npm start")},{shell:true,stdio:'inherit',env:{...process.env,SANDBOX_ID:${JSON.stringify(sandbox.id)}}});\nchild.on('exit',code=>process.exit(code??1));`,
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
const CHISEL_PORT = 8080;
const CHISEL_URL =
  "https://github.com/jpillora/chisel/releases/download/v1.10.1/chisel_1.10.1_linux_amd64.gz";
const globals = globalThis as typeof globalThis & { kyaTunnel?: ChildProcess };
/** Laptop side of the reverse tunnel: sandbox localhost:3000/5050/8545 → this machine. */
function startTunnelClient(url: string, token?: string) {
  globals.kyaTunnel?.kill();
  const bin =
    process.env.CHISEL_BIN || path.resolve(process.cwd(), "../../.tools/chisel");
  const logDir = path.resolve(process.cwd(), "../../.logs");
  mkdirSync(logDir, { recursive: true });
  const log = openSync(path.join(logDir, "chisel.log"), "a");
  const child = spawn(
    bin,
    [
      "client",
      ...(token ? ["--header", `x-daytona-preview-token: ${token}`] : []),
      "--keepalive",
      "25s",
      url,
      "R:3000:localhost:3000",
      "R:5050:localhost:5050",
      "R:8545:localhost:8545",
      "R:8546:localhost:8546",
      "R:8547:localhost:8547",
    ],
    { stdio: ["ignore", log, log], detached: false },
  );
  child.on("exit", (code) => console.log(`[kya] tunnel client exited (${code})`));
  globals.kyaTunnel = child;
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
