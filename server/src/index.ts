import { Store, SITE } from "./data.ts";
import { TOOLS, ToolError, callTool, INSTRUCTIONS } from "./tools.ts";

export interface Env {
  RATE_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> };
}

// خادم MCP عديم الحالة، للقراءة فقط، بنقل Streamable HTTP وردود JSON.
// بلا مكتبة SDK عمدًا: حدّ المعالجة في الطبقة المجّانيّة ١٠ م.ث، والبروتوكول هنا أربع طرق.
const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER = { name: "qawlat", title: "Qawlat — قَولات", version: "1.0.1", websiteUrl: `${SITE}/ai/` };
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Authorization",
};
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...CORS };

interface Rpc { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }
const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const err = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

let store: Store | undefined;
const liveFetcher = (path: string) =>
  fetch(SITE + path, { cf: { cacheEverything: true, cacheTtl: 3600 } } as RequestInit);

export async function handleRpc(m: Rpc, s: Store): Promise<object | null> {
  if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") return err(m?.id, -32600, "Invalid Request");
  if (m.id === undefined) return null; // إشعار
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion ?? "");
      return ok(m.id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, { tools: TOOLS });
    case "tools/call": {
      const name = String(m.params?.name ?? "");
      if (!TOOLS.some((t) => t.name === name)) return err(m.id, -32602, `Unknown tool: ${name}`);
      try {
        const data = await callTool(name, (m.params?.arguments ?? {}) as Record<string, unknown>, s);
        return ok(m.id, { content: [{ type: "text", text: JSON.stringify(data) }] });
      } catch (e) {
        // الخطأ المتوقَّع يُعاد للنموذج ليصحّح مدخله، وغيره رسالة عامّة بلا تفاصيل داخليّة.
        const text = e instanceof ToolError ? e.message : "تعذّر جلب البيانات الآن، أعد المحاولة.";
        return ok(m.id, { isError: true, content: [{ type: "text", text }] });
      }
    }
    default:
      return err(m.id, -32601, "Method not found");
  }
}

export async function handleRequest(req: Request, env: Env, s: Store): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/\/+$/, "") || "/";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (path !== "/mcp") {
    return new Response(JSON.stringify({ name: SERVER.title, mcp: `${SITE}/mcp`, docs: `${SITE}/ai/` }), { status: path === "/" ? 200 : 404, headers: JSON_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS", ...CORS } });
  }
  if (env.RATE_LIMITER) {
    // خلف وكيل Netlify يكون عنوان الاتّصال عنوان الوكيل، فيُقدَّم عنوان العميل الذي يمرّره.
    const ip = req.headers.get("x-nf-client-connection-ip") ?? req.headers.get("cf-connecting-ip") ?? "anon";
    const { success } = await env.RATE_LIMITER.limit({ key: ip });
    if (!success) return new Response(JSON.stringify(err(null, -32000, "Rate limit exceeded")), { status: 429, headers: JSON_HEADERS });
  }
  let body: Rpc | Rpc[];
  try {
    body = (await req.json()) as Rpc | Rpc[];
  } catch {
    return new Response(JSON.stringify(err(null, -32700, "Parse error")), { status: 400, headers: JSON_HEADERS });
  }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleRpc(m, s)))).filter(Boolean);
    return out.length ? new Response(JSON.stringify(out), { headers: JSON_HEADERS }) : new Response(null, { status: 202, headers: CORS });
  }
  const out = await handleRpc(body, s);
  return out ? new Response(JSON.stringify(out), { headers: JSON_HEADERS }) : new Response(null, { status: 202, headers: CORS });
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    store ??= new Store(liveFetcher);
    return handleRequest(req, env, store);
  },
};
