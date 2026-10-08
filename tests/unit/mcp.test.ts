import { describe, expect, it } from "vitest";
import { handleMcp, type McpData } from "@/lib/mcp";
import type { Org } from "@/lib/types";

const org = (o: Partial<Org>): Org => ({
  slug: "x",
  name: "X",
  kind: "company",
  sectors: [],
  status: "active",
  municipality: "Gurugram",
  location_precision: "municipality",
  connected_to: [],
  verification: "unverified",
  sources: [],
  updated_at: "2026-10-08",
  ...o,
});

const orgs = [
  org({ slug: "pay-co", name: "PayCo", sectors: ["fintech"], hiring: true, one_liner: "Payments", location_precision: "exact", lng: 77.0895, lat: 28.4975 }),
  org({ slug: "learn-co", name: "LearnCo", sectors: ["edtech"], location_precision: "exact", lng: 77.2, lat: 28.6 }),
  org({ slug: "vc", name: "Some VC", kind: "investor" }),
];

const d: McpData = {
  orgs: async () => orgs,
  jobs: async () => [
    { org_slug: "pay-co", title: "Backend Engineer", team: "Eng", location: "Gurugram", url: "https://jobs.lever.co/pay/1", posted: null, first_seen: "2026-10-01" },
    { org_slug: "ghost", title: "Unpublished co role", team: null, location: null, url: "https://jobs.lever.co/g/1", posted: null, first_seen: "2026-10-01" },
  ],
  events: async () => [],
  areas: [],
  siteUrl: "https://example.test",
  profilePath: (o) => (o.kind === "company" ? `/c/${o.slug}` : `/orgs/${o.slug}`),
  anchorOf: (o) => (o.lng != null && o.lat != null ? [o.lng, o.lat] : null),
};

const call = (name: string, args: Record<string, unknown> = {}) =>
  handleMcp({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: args } }, d) as Promise<any>;

describe("MCP protocol", () => {
  it("initializes, negotiating a supported protocol version", async () => {
    const r: any = await handleMcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } }, d);
    expect(r.result.protocolVersion).toBe("2025-03-26");
    expect(r.result.capabilities.tools).toBeDefined();
    const r2: any = await handleMcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } }, d);
    expect(r2.result.protocolVersion).toBe("2025-06-18");
  });

  it("ignores notifications and answers pings", async () => {
    expect(await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, d)).toBeNull();
    expect(await handleMcp({ jsonrpc: "2.0", id: "p", method: "ping" }, d)).toEqual({ jsonrpc: "2.0", id: "p", result: {} });
  });

  it("rejects malformed messages, batches and unknown methods", async () => {
    expect(((await handleMcp([], d)) as any).error.code).toBe(-32600);
    expect(((await handleMcp("x", d)) as any).error.code).toBe(-32600);
    expect(((await handleMcp({ jsonrpc: "1.0", id: 1, method: "ping" }, d)) as any).error.code).toBe(-32600);
    expect(((await handleMcp({ jsonrpc: "2.0", id: 1, method: "resources/write" }, d)) as any).error.code).toBe(-32601);
    expect(((await call("drop_tables")) as any).error.code).toBe(-32602);
  });

  it("lists read-only tools with schemas", async () => {
    const r: any = await handleMcp({ jsonrpc: "2.0", id: 2, method: "tools/list" }, d);
    const names = r.result.tools.map((t: any) => t.name);
    expect(names).toEqual(expect.arrayContaining(["search_organizations", "get_organization", "near_metro_station", "open_roles", "upcoming_events", "ecosystem_stats", "list_metro_stations"]));
    for (const t of r.result.tools) {
      expect(t.inputSchema.type).toBe("object");
      expect(t.annotations.readOnlyHint).toBe(true);
    }
  });
});

describe("MCP tools", () => {
  it("searches with filters and caps the limit", async () => {
    const r = await call("search_organizations", { sector: "fintech", hiring_only: true });
    expect(r.result.structuredContent.results.map((x: any) => x.slug)).toEqual(["pay-co"]);
    expect(r.result.structuredContent.results[0].url).toBe("https://example.test/c/pay-co");
    const all = await call("search_organizations", { limit: 10_000 });
    expect(all.result.structuredContent.total).toBe(3);
    const vc = await call("search_organizations", { kind: "investor" });
    expect(vc.result.structuredContent.results[0].url).toBe("https://example.test/orgs/vc");
  });

  it("reports bad arguments as tool errors, not crashes", async () => {
    const r = await call("search_organizations", { limit: "lots" });
    expect(r.result.isError).toBe(true);
    const missing = await call("get_organization", { slug: "nope" });
    expect(missing.result.isError).toBe(true);
    const station = await call("near_metro_station", { station: "atlantis" });
    expect(station.result.isError).toBe(true);
  });

  it("finds companies near a station, nearest first", async () => {
    const r = await call("near_metro_station", { station: "cyber-city", radius_m: 1000 });
    const res = r.result.structuredContent.results;
    expect(res.map((x: any) => x.slug)).toEqual(["pay-co"]);
    expect(res[0].distance_m).toBeLessThan(1000);
  });

  it("only lists roles at published companies", async () => {
    const r = await call("open_roles", { query: "engineer" });
    expect(r.result.structuredContent.results).toEqual([
      expect.objectContaining({ company: "PayCo", title: "Backend Engineer", url: "https://jobs.lever.co/pay/1" }),
    ]);
    expect(r.result.structuredContent.total).toBe(1);
  });

  it("returns full profiles and stats", async () => {
    const p = await call("get_organization", { slug: "pay-co" });
    expect(p.result.structuredContent).toMatchObject({ slug: "pay-co", name: "PayCo", sources: [] });
    expect(p.result.content[0].type).toBe("text");
    const s = await call("ecosystem_stats");
    expect(s.result.structuredContent.totals.companies).toBe(2);
    const st = await call("list_metro_stations");
    expect(st.result.structuredContent.items.length).toBeGreaterThan(10);
  });
});
