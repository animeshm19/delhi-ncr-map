import { AREAS, anchorOf, getEvents, getJobs, getOrgs, profilePath } from "@/lib/data";
import { handleMcp, MAX_BODY_BYTES, type McpData } from "@/lib/mcp";
import { SITE_URL } from "@/lib/site";

// Read-only MCP endpoint (Streamable HTTP, stateless). Add it to an MCP client as
// https://delhincr-map.vercel.app/api/mcp
export const dynamic = "force-dynamic";

const data: McpData = {
  orgs: getOrgs,
  jobs: getJobs,
  events: (days) => getEvents({ toIso: new Date(Date.now() + days * 86_400_000).toISOString(), limit: 100 }),
  areas: AREAS,
  siteUrl: SITE_URL,
  profilePath,
  anchorOf,
};

// Public, read-only data: any site may call it, but never with cookies.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, mcp-protocol-version, mcp-session-id, accept",
  "access-control-max-age": "86400",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export function GET() {
  // No server-initiated stream: this server only answers requests.
  return new Response("Method not allowed", { status: 405, headers: { ...CORS, allow: "POST, OPTIONS" } });
}

export async function POST(req: Request) {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Send application/json" } }, { status: 415, headers: CORS });
  }
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, { status: 413, headers: CORS });
  }
  let msg: unknown;
  try {
    msg = JSON.parse(text);
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: CORS });
  }
  const res = await handleMcp(msg, data);
  if (!res) return new Response(null, { status: 202, headers: CORS });
  // Malformed messages are client errors; everything else (including tool errors) is a normal JSON-RPC reply.
  const status = "error" in res && (res.error.code === -32600 || res.error.code === -32700) ? 400 : 200;
  return Response.json(res, { status, headers: { ...CORS, "cache-control": "no-store" } });
}
