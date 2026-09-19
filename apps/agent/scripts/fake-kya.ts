// Stub of A's platform for 접점 4 boot testing: register → delegation (issued on 2nd poll) → events.
import { Hono } from "hono";
import { serve } from "@hono/node-server";
const app = new Hono();
const polls = new Map<string, number>();
app.post("/agents/register", async (c) => { const b = await c.req.json(); console.log("[kya] register", b); return c.json({ ok: true }); });
app.get("/agents/:address/delegation", (c) => {
  const a = c.req.param("address"); const n = (polls.get(a) ?? 0) + 1; polls.set(a, n);
  if (n < 2) return c.json({ error: "not_issued" }, 404);
  console.log("[kya] delegation issued to", a);
  return c.json({ delegation: "fake.jwt.for-" + a.slice(0, 8) });
});
app.post("/agents/:address/events", async (c) => { console.log("[kya] event", await c.req.json()); return c.json({ ok: true }); });
serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, () => console.log("[fake-kya] :3000"));
