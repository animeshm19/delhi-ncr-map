/**
 * A small, read-only Model Context Protocol server (JSON-RPC 2.0 over Streamable HTTP,
 * stateless, JSON responses). Everything it returns is already public on the site.
 *
 * Pure: data comes in through `McpData`, so it's unit-tested without a server.
 */
import { haversineMeters } from "./geo";
import { METRO, getStation } from "./metro";
import { ecosystemStats } from "./stats";
import { SECTORS, sectorLabel } from "./taxonomy";
import type { Area, EventItem, Job, Org } from "./types";

export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const MAX_BODY_BYTES = 64 * 1024;

export type McpData = {
  orgs: () => Promise<Org[]>;
  jobs: () => Promise<Job[]>;
  events: (days: number) => Promise<EventItem[]>;
  areas: Area[];
  siteUrl: string;
  profilePath: (o: Pick<Org, "slug" | "kind">) => string;
  anchorOf: (o: Org) => [number, number] | null;
};

type JsonRpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string } };

const err = (id: JsonRpcRequest["id"], code: number, message: string): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

class ToolInputError extends Error {}

// ---------- argument helpers ----------
const str = (a: Record<string, unknown>, k: string, max = 100) => {
  const v = a[k];
  if (v == null || v === "") return undefined;
  if (typeof v !== "string") throw new ToolInputError(`${k} must be a string`);
  return v.slice(0, max);
};
const int = (a: Record<string, unknown>, k: string, min: number, max: number, dflt: number) => {
  const v = a[k];
  if (v == null) return dflt;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new ToolInputError(`${k} must be a number`);
  return Math.min(max, Math.max(min, Math.round(v)));
};
const bool = (a: Record<string, unknown>, k: string) => a[k] === true;

const TOOLS = [
  {
    name: "search_organizations",
    title: "Search organisations",
    description:
      "Search Delhi NCR startups, tech companies and support organisations (accelerators, investors, coworking, communities) on Delhi Tech Map. Filter by text, sector, city, kind or hiring.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to match in the name, description or place" },
        sector: { type: "string", enum: Object.keys(SECTORS) },
        city: { type: "string", description: "e.g. Gurugram" },
        kind: { type: "string", enum: ["company", "accelerator", "investor", "coworking", "university_research", "government_program", "community_group"] },
        hiring_only: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_organization",
    title: "Get an organisation",
    description: "Full public profile of one organisation by its slug, including sources for each fact.",
    inputSchema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"], additionalProperties: false },
  },
  {
    name: "near_metro_station",
    title: "Companies near a metro station",
    description: "Companies within a straight-line distance of any Delhi NCR metro or Namo Bharat station, nearest first.",
    inputSchema: {
      type: "object",
      properties: {
        station: { type: "string", description: "Station id from list_metro_stations, e.g. cyber-city" },
        radius_m: { type: "integer", minimum: 100, maximum: 5000, default: 1000 },
      },
      required: ["station"],
      additionalProperties: false,
    },
  },
  {
    name: "list_metro_stations",
    title: "List metro stations",
    description: "Metro stations covered by the map, with ids, lines and coordinates.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "upcoming_events",
    title: "Upcoming events",
    description: "Reviewed startup and tech events in Delhi NCR in the next N days.",
    inputSchema: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 90, default: 30 } }, additionalProperties: false },
  },
  {
    name: "open_roles",
    title: "Open roles",
    description: "Open roles read daily from companies' public job boards. Filter by text or company slug.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        company: { type: "string", description: "Company slug" },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "ecosystem_stats",
    title: "Ecosystem stats",
    description: "Counts by sector, founding year, area and kind for everything on the map.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
].map((t) => ({ ...t, annotations: { readOnlyHint: true, openWorldHint: false } }));

function summary(o: Org, d: McpData) {
  return {
    slug: o.slug,
    name: o.name,
    kind: o.kind,
    sectors: o.sectors.map(sectorLabel),
    city: o.municipality,
    area: d.areas.find((a) => a.slug === o.area)?.name ?? null,
    one_liner: o.one_liner ?? null,
    website: o.website ?? null,
    founded_year: o.founded_year ?? null,
    hiring: o.hiring ?? null,
    url: `${d.siteUrl}${d.profilePath(o)}`,
  };
}

async function callTool(name: string, a: Record<string, unknown>, d: McpData): Promise<unknown> {
  switch (name) {
    case "search_organizations": {
      const q = str(a, "query")?.toLowerCase();
      const sector = str(a, "sector");
      const city = str(a, "city")?.toLowerCase();
      const kind = str(a, "kind");
      const limit = int(a, "limit", 1, 50, 20);
      const all = (await d.orgs()).filter(
        (o) =>
          (!q || `${o.name} ${o.one_liner ?? ""} ${o.municipality} ${o.area ?? ""}`.toLowerCase().includes(q)) &&
          (!sector || o.sectors.includes(sector)) &&
          (!city || o.municipality.toLowerCase() === city) &&
          (!kind || o.kind === kind) &&
          (!bool(a, "hiring_only") || o.hiring),
      );
      return { total: all.length, results: all.slice(0, limit).map((o) => summary(o, d)) };
    }
    case "get_organization": {
      const slug = str(a, "slug", 80);
      const o = slug ? (await d.orgs()).find((x) => x.slug === slug) : undefined;
      if (!o) throw new ToolInputError("No organisation with that slug.");
      return {
        ...summary(o, d),
        status: o.status,
        funding_note: o.funding_note ?? null,
        location_precision: o.location_precision,
        address: o.address ?? null,
        careers_url: o.careers_url ?? null,
        open_roles: o.open_roles ?? null,
        verification: o.verification,
        sources: o.sources,
        updated_at: o.updated_at,
      };
    }
    case "list_metro_stations":
      return METRO.stations.map((s) => ({ id: s.id, name: s.name, lines: s.lines.map((l) => METRO.lines.find((x) => x.slug === l)?.name ?? l), lat: s.lat, lng: s.lng }));
    case "near_metro_station": {
      const st = getStation(str(a, "station", 60));
      if (!st) throw new ToolInputError("Unknown station. Use list_metro_stations for ids.");
      const radius = int(a, "radius_m", 100, 5000, 1000);
      const near = (await d.orgs())
        .filter((o) => o.kind === "company")
        .map((o) => ({ o, at: d.anchorOf(o) }))
        .filter((x) => x.at)
        .map((x) => ({ o: x.o, m: haversineMeters(x.at!, [st.lng, st.lat]) }))
        .filter((x) => x.m <= radius)
        .sort((x, y) => x.m - y.m);
      return {
        station: st.name,
        radius_m: radius,
        note: "Straight-line distance; approximate pins are measured from their sector's centre.",
        results: near.slice(0, 50).map(({ o, m }) => ({ ...summary(o, d), distance_m: Math.round(m) })),
      };
    }
    case "upcoming_events": {
      const days = int(a, "days", 1, 90, 30);
      return (await d.events(days)).map((e) => ({
        title: e.title,
        starts_at: e.starts_at,
        ends_at: e.ends_at,
        venue: e.venue,
        city: e.city,
        organizer: e.organizer,
        url: e.url,
      }));
    }
    case "open_roles": {
      const q = str(a, "query")?.toLowerCase();
      const company = str(a, "company", 80);
      const limit = int(a, "limit", 1, 50, 20);
      const names = new Map((await d.orgs()).map((o) => [o.slug, o.name]));
      const roles = (await d.jobs()).filter(
        (j) =>
          names.has(j.org_slug) &&
          (!company || j.org_slug === company) &&
          (!q || `${j.title} ${j.team ?? ""} ${j.location ?? ""} ${names.get(j.org_slug)}`.toLowerCase().includes(q)),
      );
      return {
        total: roles.length,
        results: roles.slice(0, limit).map((j) => ({ company: names.get(j.org_slug), company_slug: j.org_slug, title: j.title, team: j.team, location: j.location, url: j.url, posted: j.posted })),
      };
    }
    case "ecosystem_stats": {
      const s = ecosystemStats(await d.orgs(), d.areas);
      const pick = (bars: { label: string; value: number }[]) => bars.map((b) => ({ label: b.label, count: b.value }));
      return { totals: s.totals, by_sector: pick(s.bySector), by_year: pick(s.byYear.filter((b) => b.value)), by_area: pick(s.byArea), support: pick(s.support) };
    }
    default:
      throw Object.assign(new Error("Unknown tool"), { code: -32602 });
  }
}

/** Handle one JSON-RPC message. Returns null for notifications (no response body). */
export async function handleMcp(msg: unknown, d: McpData): Promise<JsonRpcResponse | null> {
  if (Array.isArray(msg)) return err(null, -32600, "Batching is not supported");
  if (!msg || typeof msg !== "object") return err(null, -32600, "Invalid request");
  const m = msg as JsonRpcRequest;
  if (m.jsonrpc !== "2.0" || typeof m.method !== "string") return err(m.id, -32600, "Invalid request");
  const isNotification = m.id === undefined;
  if (isNotification) return null;
  const params = m.params && typeof m.params === "object" ? m.params : {};

  switch (m.method) {
    case "initialize": {
      const asked = String(params.protocolVersion ?? "");
      return {
        jsonrpc: "2.0",
        id: m.id ?? null,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSIONS.includes(asked) ? asked : MCP_PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "delhincr-map", title: "Delhi Tech Map", version: "1.0.0" },
          instructions:
            "Read-only access to Delhi Tech Map: startups, support organisations, metro proximity, open roles and events. All data is public and sourced; cite profile URLs.",
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id: m.id ?? null, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id: m.id ?? null, result: { tools: TOOLS } };
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      if (!TOOLS.some((t) => t.name === name)) return err(m.id, -32602, `Unknown tool: ${name.slice(0, 60)}`);
      const args = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments) ? (params.arguments as Record<string, unknown>) : {};
      try {
        const data = await callTool(name, args, d);
        return {
          jsonrpc: "2.0",
          id: m.id ?? null,
          result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: Array.isArray(data) ? { items: data } : data, isError: false },
        };
      } catch (e) {
        if (e instanceof ToolInputError) {
          return { jsonrpc: "2.0", id: m.id ?? null, result: { content: [{ type: "text", text: e.message }], isError: true } };
        }
        return err(m.id, -32603, "Internal error");
      }
    }
    default:
      return err(m.id, -32601, "Method not found");
  }
}
