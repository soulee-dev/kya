import { randomUUID } from "node:crypto";

export interface LineItem {
  id: string;
  item: { id: string; title: string; price: { amount: string; currency: "USDC" }; image_url: string; brand: string; url: string };
  quantity: number;
  totals: { type: "total"; amount: string }[];
}

// Minimal UCP checkout object (ucp.dev/2026-08-25/schemas/shopping/checkout.json required keys).
export interface Checkout {
  ucp: { version: string };
  id: string;
  line_items: LineItem[];
  status: "ready_for_complete" | "complete_in_progress" | "completed" | "canceled";
  currency: "USDC";
  totals: { type: "subtotal" | "total"; amount: string }[];
  links: { type: string; url: string }[];
  buyer?: unknown;
  order?: { id: string; tx?: string; completed_at: string };
  total: string; // convenience mirror of totals[type=total]
  command_id?: string;
  created_at: string;
}

export interface Decision {
  at: string;
  checkoutId?: string;
  payer?: string;
  amount: string;
  decision: "approved" | "denied";
  reason: string;
  txHash?: string;
  hasDelegation: boolean;
  stage: "verify" | "settle";
}

export interface CommandEvent { at: string; step: string; message: string; data?: unknown }
export interface Command {
  id: string;
  text: string;
  status: "queued" | "running" | "done";
  created_at: string;
  events: CommandEvent[];
  result?: { checkoutId?: string; productId?: string; outcome: "purchased" | "denied" | "not_found" | "error"; message: string };
}

class Store {
  private checkouts = new Map<string, Checkout>();
  private commands: Command[] = [];
  private decisions: Decision[] = [];

  createCheckout(input: { line_items: LineItem[]; total: string; buyer?: unknown; commandId?: string; publicUrl: string }): Checkout {
    const id = `co_${randomUUID().slice(0, 8)}`;
    const co: Checkout = {
      ucp: { version: "2026-08-25" },
      id,
      line_items: input.line_items,
      status: "ready_for_complete",
      currency: "USDC",
      totals: [
        { type: "subtotal", amount: input.total },
        { type: "total", amount: input.total },
      ],
      links: [{ type: "complete", url: `${input.publicUrl}/checkout-sessions/${id}/complete` }],
      buyer: input.buyer,
      total: input.total,
      command_id: input.commandId,
      created_at: new Date().toISOString(),
    };
    this.checkouts.set(id, co);
    const cmd = input.commandId ? this.getCommand(input.commandId) : undefined;
    if (cmd) this.addEvent(cmd, "checkout", `체크아웃 생성 ${id} (${(Number(input.total) / 1e6).toFixed(2)} USDC)`, { checkoutId: id });
    return co;
  }
  getCheckout(id: string) { return this.checkouts.get(id); }
  completeCheckout(id: string, tx?: string) {
    const co = this.checkouts.get(id);
    if (!co) return;
    co.status = "completed";
    co.order = { id: `ord_${id.slice(3)}`, tx: tx ?? co.order?.tx, completed_at: co.order?.completed_at ?? new Date().toISOString() };
  }

  decide(d: Omit<Decision, "at">) {
    const dec = { at: new Date().toISOString(), ...d };
    this.decisions.unshift(dec);
    const co = d.checkoutId ? this.checkouts.get(d.checkoutId) : undefined;
    const cmd = co?.command_id ? this.getCommand(co.command_id) : undefined;
    if (cmd) this.addEvent(cmd, d.stage, `${d.decision === "approved" ? "✅ 승인" : "⛔ 거절"} · ${d.reason}`, dec);
    console.log(`[decision] ${d.stage} ${d.decision} ${d.reason} amount=${d.amount} payer=${d.payer ?? "?"}`);
  }

  createCommand(text: string): Command {
    const cmd: Command = { id: `cmd_${randomUUID().slice(0, 8)}`, text, status: "queued", created_at: new Date().toISOString(), events: [] };
    this.commands.unshift(cmd);
    return cmd;
  }
  claimNextCommand(): Command | undefined {
    const cmd = [...this.commands].reverse().find((c) => c.status === "queued");
    if (cmd) { cmd.status = "running"; this.addEvent(cmd, "start", "에이전트가 요청을 받았어요"); }
    return cmd;
  }
  getCommand(id: string) { return this.commands.find((c) => c.id === id); }
  addEvent(cmd: Command, step: string, message: string, data?: unknown) {
    cmd.events.push({ at: new Date().toISOString(), step, message, data });
  }
  finishCommand(cmd: Command, result?: Command["result"]) {
    cmd.status = "done";
    cmd.result = result;
  }

  snapshot() {
    return {
      commands: this.commands.slice(0, 20),
      checkouts: [...this.checkouts.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20),
      decisions: this.decisions.slice(0, 50),
    };
  }
}

export const store = new Store();
