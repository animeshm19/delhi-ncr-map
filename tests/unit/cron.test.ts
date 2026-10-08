import { describe, expect, it } from "vitest";
import { cronAuthorised } from "@/lib/cron";

describe("cronAuthorised", () => {
  const secret = "s".repeat(32);
  it("accepts only the exact bearer header", () => {
    expect(cronAuthorised(`Bearer ${secret}`, secret)).toBe(true);
    expect(cronAuthorised(`Bearer ${secret}x`, secret)).toBe(false);
    expect(cronAuthorised(`bearer ${secret}`, secret)).toBe(false);
    expect(cronAuthorised(secret, secret)).toBe(false);
    expect(cronAuthorised(null, secret)).toBe(false);
    expect(cronAuthorised("", secret)).toBe(false);
  });
  it("is closed when the secret is missing or weak", () => {
    expect(cronAuthorised("Bearer ", "")).toBe(false);
    expect(cronAuthorised("Bearer undefined", undefined)).toBe(false);
    expect(cronAuthorised("Bearer short", "short")).toBe(false);
  });
});
