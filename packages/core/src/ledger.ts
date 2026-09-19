import { JsonState } from "./store";

export interface LedgerEntry {
  spent: string;
  cumulativeLimit: string;
  settlements: Array<{ at: string; amount: string; txHash?: string; payTo: string }>;
}

/** Spend Ledger: Delegation(jti)마다 정산된 금액의 합. 누적 한도 검사의 근거. */
export class SpendLedger {
  private readonly state: JsonState<Record<string, LedgerEntry>>;

  constructor(path?: string) {
    this.state = new JsonState(path, () => ({}));
  }

  spent(jti: string): bigint {
    return BigInt(this.state.get()[jti]?.spent ?? "0");
  }

  entry(jti: string): LedgerEntry | undefined {
    return this.state.get()[jti];
  }

  /** settle 성공 시점에만 호출한다. */
  add(jti: string, amount: string, cumulativeLimit: string, meta: { payTo: string; txHash?: string }): LedgerEntry {
    return this.state.update((all) => {
      const cur = all[jti] ?? { spent: "0", cumulativeLimit, settlements: [] };
      cur.spent = (BigInt(cur.spent) + BigInt(amount)).toString();
      cur.cumulativeLimit = cumulativeLimit;
      cur.settlements.push({ at: new Date().toISOString(), amount, ...meta });
      all[jti] = cur;
    })[jti];
  }

  all(): Record<string, LedgerEntry> {
    return this.state.get();
  }
}
