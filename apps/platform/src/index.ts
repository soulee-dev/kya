import { serve } from "@hono/node-server";
import { join } from "node:path";
import { createPlatform, createSandboxLauncher, createTreasury } from "@kya/core";
import { createPlatformApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 4001);
const HOST = process.env.PUBLIC_HOST ?? `localhost:${PORT}`;
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), "data");
const KYA_URL = process.env.KYA_URL ?? (HOST.startsWith("localhost") ? `http://${HOST}` : `https://${HOST}`);

const treasury = process.env.TREASURY_PRIVATE_KEY
  ? createTreasury({ privateKey: process.env.TREASURY_PRIVATE_KEY as `0x${string}`, rpcUrl: process.env.BASE_SEPOLIA_RPC })
  : undefined;

const sandboxes =
  process.env.DAYTONA_API_KEY && process.env.RUNNER_DIR
    ? createSandboxLauncher({
        apiKey: process.env.DAYTONA_API_KEY,
        apiUrl: process.env.DAYTONA_API_URL,
        target: process.env.DAYTONA_TARGET,
        runnerDir: process.env.RUNNER_DIR,
        runCommand: process.env.RUNNER_CMD,
      })
    : undefined;

const platform = await createPlatform({
  host: HOST,
  dataDir: DATA_DIR,
  treasury,
  fundingAmount: process.env.FUNDING_AMOUNT,
  sandboxes,
  runnerEnv: {
    KYA_URL,
    MERCHANT_URL: process.env.MERCHANT_URL ?? "",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
    SHOPPING_LIST: process.env.SHOPPING_LIST,
  },
});

serve({ fetch: createPlatformApp(platform).fetch, port: PORT }, () => {
  console.log(
    `[kya-platform] :${PORT} did=${platform.did} treasury=${treasury ? treasury.address : "off"} daytona=${sandboxes ? "on" : "off (local sandbox id)"}`,
  );
});
