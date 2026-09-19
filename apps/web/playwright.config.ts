import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 1440, height: 1200 },
  },
  webServer: {
    command: "pnpm exec next dev --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      WEB_DEMO_MODE: "true",
      KYA_NEXT_DIST_DIR: ".next-test",
      PUBLIC_HOST: "localhost:3100",
      VERIFIER_URL: "http://127.0.0.1:3199",
      KYA_DATA_DIR: mkdtempSync(path.join(tmpdir(), "kya-web-test-")),
    },
  },
});
