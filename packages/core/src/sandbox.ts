import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** 접점 4의 환경 변수. */
export interface RunnerEnv {
  KYA_URL: string;
  MERCHANT_URL: string;
  SANDBOX_ID: string;
  ANTHROPIC_API_KEY: string;
  SHOPPING_LIST: string;
  [k: string]: string;
}

export interface SandboxLauncherOptions {
  apiKey?: string;
  apiUrl?: string;
  target?: string;
  /** 팀원이 준 러너 디렉터리. 통째로 업로드한다. */
  runnerDir: string;
  /** 러너 실행 명령. 기본 `npm install --omit=dev && node index.js` */
  runCommand?: string;
  image?: string;
  /** 샌드박스 안 작업 디렉터리. 기본 /home/daytona/runner */
  workdir?: string;
  /** 자동 정지(분). 기본 60 */
  autoStopInterval?: number;
}

export interface SandboxLauncher {
  /** 샌드박스를 만들고 러너를 올린 뒤 백그라운드로 실행한다. 반환은 sandbox id. */
  launch(env: Omit<RunnerEnv, "SANDBOX_ID">, labels?: Record<string, string>): Promise<{ sandboxId: string }>;
  /** 러너 로그 꼬리(있으면). */
  logs(sandboxId: string, lines?: number): Promise<string>;
  destroy(sandboxId: string): Promise<void>;
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".next"]);

export function listRunnerFiles(dir: string): Array<{ rel: string; abs: string }> {
  const out: Array<{ rel: string; abs: string }> = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const abs = join(d, name);
      const st = statSync(abs);
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(name)) walk(abs);
      } else if (st.isFile()) {
        out.push({ rel: relative(dir, abs), abs });
      }
    }
  };
  walk(dir);
  return out;
}

/** Daytona 샌드박스 = Agent의 몸. 지갑 키는 이 안에서 만들어지고 밖으로 나가지 않는다. */
export function createSandboxLauncher(opts: SandboxLauncherOptions): SandboxLauncher {
  const workdir = opts.workdir ?? "/home/daytona/runner";
  const runCommand = opts.runCommand ?? "npm install --omit=dev && node index.js";
  let clientPromise: Promise<import("@daytona/sdk").Daytona> | undefined;

  const client = () => {
    if (!clientPromise) {
      clientPromise = import("@daytona/sdk").then(
        ({ Daytona }) => new Daytona({ apiKey: opts.apiKey, apiUrl: opts.apiUrl, target: opts.target as never }),
      );
    }
    return clientPromise;
  };

  return {
    async launch(env, labels = {}) {
      const daytona = await client();
      const sandbox = await daytona.create(
        {
          image: opts.image ?? "node:22",
          envVars: { ...env },
          labels: { app: "kya", ...labels },
          autoStopInterval: opts.autoStopInterval ?? 60,
        },
        { timeout: 120 },
      );
      const sandboxId = sandbox.id;
      const files = listRunnerFiles(opts.runnerDir);
      await sandbox.fs.uploadFiles(
        files.map((f) => ({ source: readFileSync(f.abs), destination: `${workdir}/${f.rel}` })),
      );
      const envExports = Object.entries({ ...env, SANDBOX_ID: sandboxId })
        .map(([k, v]) => `export ${k}=${shellQuote(v)}`)
        .join("; ");
      // 백그라운드 실행. 로그는 runner.log에 남긴다.
      await sandbox.process.executeCommand(
        `bash -lc ${shellQuote(`${envExports}; cd ${workdir} && nohup sh -c ${shellQuote(runCommand)} > ${workdir}/runner.log 2>&1 &`)}`,
        workdir,
        undefined,
        30,
      );
      return { sandboxId };
    },
    async logs(sandboxId, lines = 100) {
      const daytona = await client();
      const sandbox = await daytona.get(sandboxId);
      const r = await sandbox.process.executeCommand(`tail -n ${lines} ${workdir}/runner.log 2>/dev/null || true`, workdir);
      return r.result ?? "";
    },
    async destroy(sandboxId) {
      const daytona = await client();
      const sandbox = await daytona.get(sandboxId);
      await sandbox.delete();
    },
  };
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
