import path from "node:path";
import { JsonState } from "@kya/core";
import type { AppState } from "./types";
export const dataDir =
  process.env.KYA_DATA_DIR || path.join(process.cwd(), "data");
const globals = globalThis as typeof globalThis & {
  kyaQueue?: Promise<unknown>;
  kyaState?: JsonState<AppState>;
};
/** 화면 상태. 메모리에 두고 바뀔 때마다 `data/state.json`에 즉시 기록한다. */
function store() {
  return (globals.kyaState ??= new JsonState<AppState>(
    path.join(dataDir, "state.json"),
    () => ({
      principal: null,
      sandbox: null,
      agent: null,
      delegation: null,
      events: [],
    }),
  ));
}
/** 쓰기 요청을 한 줄로 세워 동시 수정이 겹치지 않게 한다. */
export function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const job = (globals.kyaQueue ?? Promise.resolve()).then(fn);
  globals.kyaQueue = job.catch(() => undefined);
  return job;
}
export async function readState(): Promise<AppState> {
  return store().get();
}
export async function writeState(state: AppState) {
  store().update((draft) => Object.assign(draft, state));
}
export function event(state: AppState, step: string, message: string) {
  state.events.push({ at: new Date().toISOString(), step, message });
  state.events = state.events.slice(-200);
}
