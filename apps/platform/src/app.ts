import { Hono } from "hono";
import { cors } from "hono/cors";
import { PlatformError, type Platform } from "@kya/core";

/**
 * 발급 쪽 HTTP 라우트. 접점 4의 경로(`/agents/...`)와 웹 브리프의 `/api/...` 둘 다에 같은 라우터를 붙인다.
 * Next.js에서 쓰려면 `hono/vercel`의 handle(createPlatformApp(platform)) 로 마운트하면 된다.
 */
export function createPlatformApp(platform: Platform): Hono {
  const api = new Hono();

  api.post("/principals", async (c) => c.json(await platform.verifyIdentity(await c.req.json()), 201));
  api.get("/principals/:id", (c) => {
    const p = platform.getPrincipal(c.req.param("id"));
    return p ? c.json(p) : c.json({ error: "not found" }, 404);
  });

  api.post("/sandboxes", async (c) => c.json(await platform.createSandbox(), 201));
  api.get("/sandboxes/:id/logs", async (c) => c.text(await platform.sandboxLogs(c.req.param("id"))));

  api.post("/agents/register", async (c) => c.json(platform.registerAgent(await c.req.json()), 201));
  api.get("/agents/:address/delegation", (c) => {
    const d = platform.getDelegation(c.req.param("address"));
    return d ? c.json({ delegation: d.delegation, jti: d.jti, exp: d.exp }) : c.json({ error: "not issued" }, 404);
  });
  api.post("/agents/:address/events", async (c) =>
    c.json(platform.recordEvent(c.req.param("address"), await c.req.json()), 201),
  );

  api.post("/delegations", async (c) => {
    const rec = await platform.issueDelegation(await c.req.json());
    return c.json({ delegation: rec.delegation, jti: rec.jti, exp: rec.exp, scope: rec.scope, fundingTx: rec.fundingTx ?? null }, 201);
  });

  api.get("/state", (c) => c.json(platform.state()));

  const app = new Hono();
  app.use("*", cors({ origin: "*" }));
  app.get("/", (c) => c.json({ service: "kya-platform", did: platform.did }));
  app.get("/.well-known/did.json", (c) => c.json(platform.didDocument()));
  app.route("/api", api);
  app.route("/", api);

  app.onError((err, c) => {
    if (err instanceof PlatformError) return c.json({ error: err.message }, err.status as 400);
    console.error(err);
    return c.json({ error: err.message }, 500);
  });
  return app;
}
