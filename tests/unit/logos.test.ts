import { describe, expect, it } from "vitest";
import { orgLogo, websiteHost } from "@/lib/logos";

describe("logos", () => {
  it("reads a clean public host from a website, and nothing else", () => {
    expect(websiteHost("https://www.spinny.com/")).toBe("spinny.com");
    expect(websiteHost("http://Example.co.in/path?q=1")).toBe("example.co.in");
    for (const bad of [null, "", "javascript:alert(1)", "ftp://x.com", "https://localhost:3000", "https://127.0.0.1/", "https://[::1]/", "not a url", "https://intranet/"]) {
      expect(websiteHost(bad), String(bad)).toBeNull();
    }
  });

  it("uses an uploaded logo first, then the website icon, then nothing", () => {
    expect(orgLogo({ slug: "spinny", website: "https://www.spinny.com/" })).toBe("/logo/spinny");
    expect(orgLogo({ slug: "spinny", website: null })).toBeNull();
    expect(orgLogo({ slug: "x", website: "javascript:alert(1)" })).toBeNull();
  });
});
