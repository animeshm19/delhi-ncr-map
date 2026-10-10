import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import areasJson from "@/data/areas.json";
import seedJson from "@/data/seed.json";
import { CITIES } from "@/lib/site";
import { KINDS, SECTORS } from "@/lib/taxonomy";
import type { Area, Org } from "@/lib/types";

const orgs = seedJson as unknown as Org[];
const areas = areasJson as Area[];
const areaBySlug = new Map(areas.map((a) => [a.slug, a]));
const liveCities = new Set(CITIES.filter((c) => c.live).map((c) => c.name));
// The 19 Gurugram areas from the first release predate cited anchors; every newer one must have one.
const ORIGINAL_AREAS = 19;

describe("organisations", () => {
  it("have unique, URL-safe slugs and names", () => {
    const slugs = orgs.map((o) => o.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    for (const o of orgs) expect(o.name.trim().length, o.slug).toBeGreaterThan(0);
  });

  it("every one comes from a public list, with https sources and read dates", () => {
    for (const o of orgs) {
      expect(o.sources.some((s) => s.fields.includes("listing")), `${o.slug} has a listing source`).toBe(true);
      for (const s of o.sources) {
        expect(s.url, o.slug).toMatch(/^https:\/\/[^\s<>"]+$/);
        expect(s.retrieved, o.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(s.note.length, o.slug).toBeGreaterThan(0);
      }
    }
  });

  it("use known kinds, sectors and statuses, in live cities", () => {
    for (const o of orgs) {
      expect(Object.keys(KINDS), o.slug).toContain(o.kind);
      for (const s of o.sectors) expect(Object.keys(SECTORS), `${o.slug}: ${s}`).toContain(s);
      expect(o.sectors.length, o.slug).toBeLessThanOrEqual(3);
      expect(["active", "acquired", "closed", "unknown"], o.slug).toContain(o.status);
      // Companies are in a live city; support organisations can serve the region from elsewhere.
      if (o.kind === "company") expect(liveCities.has(o.municipality), `${o.slug} in ${o.municipality}`).toBe(true);
    }
  });

  it("pins only to a sector or district in the same city, never a whole city", () => {
    for (const o of orgs.filter((o) => o.location_precision === "area")) {
      const a = areaBySlug.get(o.area ?? "");
      expect(a, `${o.slug} area ${o.area}`).toBeDefined();
      expect(["gurugram", "noida", "greater-noida"], o.slug).not.toContain(a!.slug);
      expect(a!.city, o.slug).toBe(o.municipality);
    }
    for (const o of orgs.filter((o) => o.location_precision === "municipality")) {
      expect(o.lng ?? null, o.slug).toBeNull();
    }
  });

  it("keeps founding years, funding and acquisitions well-formed", () => {
    const slugs = new Set(orgs.map((o) => o.slug));
    for (const o of orgs) {
      if (o.founded_year != null) expect(o.founded_year, o.slug).toBeGreaterThanOrEqual(1900);
      if (o.founded_year != null) expect(o.founded_year, o.slug).toBeLessThanOrEqual(2026);
      if (o.funding_note) expect(o.funding_note, o.slug).toMatch(/^\$\d+(\.\d+)?[KMB]$/);
      if (o.acquired_by) expect(slugs.has(o.acquired_by), `${o.slug} acquired by ${o.acquired_by}`).toBe(true);
      if (o.status === "acquired" || o.status === "unknown" || o.status === "closed") {
        expect(o.sources.some((s) => s.fields.includes("status") || s.url.includes("ycombinator") || s.url.includes("vcbacked")) || o.acquired_by != null || o.slug === "blinkit", `${o.slug} status is sourced`).toBe(true);
      }
    }
  });
});

describe("areas", () => {
  it("have cited anchors for every area added after the first release", () => {
    for (const a of areas.slice(ORIGINAL_AREAS)) {
      // Wikipedia, or the exact OpenStreetMap object the coordinates come from.
      expect(a.anchor?.url, a.slug).toMatch(/^https:\/\/(en\.wikipedia\.org\/wiki\/|www\.openstreetmap\.org\/(node|way|relation)\/\d+$)/);
    }
  });

  it("sit inside Delhi NCR, in a live city", () => {
    for (const a of areas) {
      expect(a.center[1], a.slug).toBeGreaterThan(28.2);
      expect(a.center[1], a.slug).toBeLessThan(28.9);
      expect(a.center[0], a.slug).toBeGreaterThan(76.8);
      expect(a.center[0], a.slug).toBeLessThan(77.7);
      expect(liveCities.has(a.city), a.slug).toBe(true);
    }
  });
});

describe("seed.sql", () => {
  it("is generated from the JSON and up to date", () => {
    expect(() => execFileSync("node", ["scripts/build-seed-sql.mjs", "--check"], { stdio: "pipe" })).not.toThrow();
  });
});
