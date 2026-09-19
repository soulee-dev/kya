import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function readJsonFile<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

/** 임시 파일에 쓴 뒤 rename 해서 깨진 JSON이 남지 않게 한다. */
export function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}

/** 메모리 상태 + JSON 파일 즉시 기록. 시작 시 파일을 읽는다. */
export class JsonState<T extends object> {
  private value: T;

  constructor(private readonly path: string | undefined, initial: () => T) {
    this.value = (path ? readJsonFile<T>(path) : undefined) ?? initial();
  }

  get(): T {
    return this.value;
  }

  update(mutate: (draft: T) => void): T {
    mutate(this.value);
    if (this.path) writeJsonFile(this.path, this.value);
    return this.value;
  }
}
