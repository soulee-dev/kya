// 샌드박스(Daytona Tier 1·2)는 npm·GitHub·Anthropic 외의 바깥 주소로 나갈 수 없다.
// 노트북에서 포트별로 상위 서비스를 되비추고, chisel 역방향 터널(R:<port>)로 샌드박스 안 localhost:<port> 에 연결한다.
import http from "node:http";
const ROUTES = {
  8545: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org", // viem RPC
  8546: "https://api.openai.com",                                    // OPENAI_BASE_URL=http://localhost:8546/v1
  8547: "https://api.anthropic.com",                                 // ANTHROPIC_BASE_URL=http://localhost:8547
};
for (const [port, upstream] of Object.entries(ROUTES)) {
  http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = { ...req.headers };
    delete headers.host; delete headers.connection; delete headers["content-length"]; delete headers["transfer-encoding"];
    try {
      const r = await fetch(upstream + req.url, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
        duplex: "half",
      });
      const out = {};
      r.headers.forEach((v, k) => { if (!["content-encoding", "transfer-encoding", "content-length", "connection"].includes(k)) out[k] = v; });
      res.writeHead(r.status, out);
      if (r.body) for await (const chunk of r.body) res.write(chunk);
      res.end();
    } catch (e) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    }
  }).listen(Number(port), () => console.log(`[egress-proxy] :${port} -> ${upstream}`));
}
