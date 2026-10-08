import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth-shared";

describe("safeNext (open-redirect guard)", () => {
  it.each([
    ["/account", "/account"],
    ["/account/spinny?tab=logo", "/account/spinny?tab=logo"],
    ["/admin", "/admin"],
  ])("keeps same-site path %s", (input, out) => expect(safeNext(input)).toBe(out));

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "/%0d%0aSet-Cookie:x=y",
    "/\u0000",
    "",
    null,
    undefined,
  ])("refuses %j", (input) => {
    const out = safeNext(input as string);
    expect(out.startsWith("/")).toBe(true);
    expect(out.startsWith("//")).toBe(false);
    expect(out).not.toMatch(/evil|javascript|\r|\n/i);
  });
});
