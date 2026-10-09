import { describe, expect, it } from "vitest";
import { badgeHeaders, contentSecurityPolicy, securityHeaders } from "@/lib/security";
import { resolveSiteUrl } from "@/lib/site";

const header = (h: { key: string; value: string }[], k: string) => h.find((x) => x.key === k)?.value;

describe("content security policy", () => {
  const csp = contentSecurityPolicy({ supabase: "https://abc.supabase.co" });
  it("blocks plugins, foreign frames and base-tag hijacking", () => {
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });
  it("never allows eval or third-party script hosts", () => {
    const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(script).not.toContain("unsafe-eval");
    expect(script).not.toMatch(/https?:/);
  });
  it("only lets the browser talk to us, the map tiles and Supabase", () => {
    const connect = csp.split("; ").find((d) => d.startsWith("connect-src"))!;
    expect(connect).toBe("connect-src 'self' https://tiles.openfreemap.org https://abc.supabase.co");
  });
  it("lets only the embed be framed", () => {
    expect(contentSecurityPolicy({ embeddable: true, supabase: null })).toContain("frame-ancestors *");
  });
});

describe("security headers", () => {
  it("sets the standard hardening headers and denies framing", () => {
    const h = securityHeaders();
    expect(header(h, "X-Content-Type-Options")).toBe("nosniff");
    expect(header(h, "X-Frame-Options")).toBe("DENY");
    expect(header(h, "Strict-Transport-Security")).toContain("max-age=");
    expect(header(h, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
  it("drops X-Frame-Options only for embeddable routes", () => {
    expect(header(securityHeaders({ embeddable: true }), "X-Frame-Options")).toBeUndefined();
  });
});

describe("badgeHeaders", () => {
  it("sandboxes badges and lets any site load them", () => {
    const h = Object.fromEntries(badgeHeaders().map((x) => [x.key, x.value]));
    expect(h["Content-Security-Policy"]).toBe("default-src 'none'; style-src 'unsafe-inline'; sandbox");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Cross-Origin-Resource-Policy"]).toBe("cross-origin");
  });
});

describe("resolveSiteUrl", () => {
  it("uses Vercel's real production domain in production, whatever NEXT_PUBLIC_SITE_URL says", () => {
    expect(
      resolveSiteUrl({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_PRODUCTION_URL: "delhi-ncr-map-animesh-mittals-projects.vercel.app",
        NEXT_PUBLIC_SITE_URL: "https://someone-elses-site.vercel.app",
      }),
    ).toBe("https://delhi-ncr-map-animesh-mittals-projects.vercel.app");
  });
  it("falls back to NEXT_PUBLIC_SITE_URL outside production, then localhost", () => {
    expect(resolveSiteUrl({ VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app", NEXT_PUBLIC_SITE_URL: "http://localhost:3100/" })).toBe("http://localhost:3100");
    expect(resolveSiteUrl({})).toBe("http://localhost:3000");
  });
  it("ignores a malformed production domain", () => {
    expect(resolveSiteUrl({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "evil.com/@x", NEXT_PUBLIC_SITE_URL: "https://ok.example" })).toBe("https://ok.example");
  });
});
