import { describe, expect, it } from "vitest";
import { badgeSvg, textWidth } from "@/lib/badge";

describe("badgeSvg", () => {
  it("escapes the name so it can't add markup", () => {
    const svg = badgeSvg({ label: "Delhi NCR Map", value: `</text><script>alert(1)</script><text>"&'` });
    expect(svg).not.toContain("<script");
    expect(svg).toContain("&lt;/text&gt;&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(svg).toContain("&quot;&amp;&apos;");
  });

  it("contains no scripts, links, handlers or external references", () => {
    const svg = badgeSvg({ label: "Delhi NCR Map", value: "Spinny" });
    expect(svg).not.toMatch(/<script|<a\b|href=|on\w+=|<foreignObject|<image|url\(/i);
    expect(svg.startsWith("<svg ")).toBe(true);
  });

  it("only accepts hex colours", () => {
    expect(badgeSvg({ label: "a", value: "b", color: "red;stroke:url(//evil)" })).toContain('fill="#7cc4ff"');
    expect(badgeSvg({ label: "a", value: "b", color: "#52b788" })).toContain('fill="#52b788"');
  });

  it("sizes to the text and caps long names", () => {
    const short = badgeSvg({ label: "Delhi NCR Map", value: "OYO" });
    const long = badgeSvg({ label: "Delhi NCR Map", value: "x".repeat(500) });
    const width = (s: string) => Number(/width="(\d+)"/.exec(s)![1]);
    expect(width(long)).toBeGreaterThan(width(short));
    expect(width(long)).toBeLessThan(500);
    expect(textWidth("MW")).toBeGreaterThan(textWidth("il"));
  });

  it("has a light theme", () => {
    expect(badgeSvg({ label: "a", value: "b", theme: "light" })).toContain('fill="#ffffff"');
  });
});
