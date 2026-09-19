import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import type { AppState } from "./types";
export const dataDir =
  process.env.KYA_DATA_DIR || path.join(process.cwd(), "data");
const globals = globalThis as typeof globalThis & {
  kyaQueue?: Promise<unknown>;
};
export function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const job = (globals.kyaQueue ?? Promise.resolve()).then(fn);
  globals.kyaQueue = job.catch(() => undefined);
  return job;
}
export async function readState(): Promise<AppState> {
  try {
    return JSON.parse(await readFile(path.join(dataDir, "state.json"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return {
      principal: null,
      sandbox: null,
      agent: null,
      delegation: null,
      events: [],
    };
  }
}
export async function writeState(state: AppState) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const file = path.join(dataDir, "state.json");
  await writeFile(file + ".tmp", JSON.stringify(state, null, 2), {
    mode: 0o600,
  });
  await rename(file + ".tmp", file);
}
export function event(state: AppState, step: string, message: string) {
  state.events.push({ at: new Date().toISOString(), step, message });
  state.events = state.events.slice(-200);
}
