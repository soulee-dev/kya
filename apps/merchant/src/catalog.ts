import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

export interface Product {
  id: string;
  source: string;
  title: string;
  brand: string;
  priceKRW: number;
  amount: string; // USDC atomic units (6 decimals). Demo rate: 1 USDC = 100,000 KRW
  currency: "USDC";
  imageUrl: string;
  url: string;
  category: string;
  tags: string[];
  alias?: string;
}

// Fixed demo scenario from docs/04-contract.md: A 3 USDC → B 8 USDC → C 4 USDC → C 4 USDC.
// These three real items get pinned to the contract prices so SHOPPING_LIST="A,B,C,C" works.
const DEMO_ALIASES: Record<string, { id: string; amount: string }> = {
  A: { id: "29cm-2900533", amount: "3000000" },
  B: { id: "musinsa-4925876", amount: "8000000" },
  C: { id: "29cm-2868378", amount: "4000000" },
};

const here = path.dirname(fileURLToPath(import.meta.url));
const raw: Product[] = JSON.parse(readFileSync(path.join(here, "../data/catalog.json"), "utf8"));

export const products: Product[] = raw.map((p) => {
  const alias = Object.entries(DEMO_ALIASES).find(([, v]) => v.id === p.id);
  if (!alias) return p;
  return { ...p, alias: alias[0], amount: alias[1].amount, priceKRW: Number(alias[1].amount) / 10 };
});

export function findProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id || p.alias === id);
}

// Tokenized substring match over title/brand/tags/category. Good enough for an LLM that
// searches with 1–3 Korean keywords; the model does the real ranking.
export function searchProducts(query: string, limit = 12): Product[] {
  const tokens = query.toLowerCase().split(/[\s,/]+/).filter(Boolean);
  if (tokens.length === 0) return products.slice(0, limit);
  const scored = products
    .map((p) => {
      const hay = [p.title, p.brand, p.category, ...p.tags].join(" ").toLowerCase();
      const score = tokens.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0);
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.priceKRW - b.p.priceKRW);
  return scored.slice(0, limit).map((x) => x.p);
}
