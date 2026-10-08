import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security";

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
