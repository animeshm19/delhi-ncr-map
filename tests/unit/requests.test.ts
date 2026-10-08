import { describe, expect, it } from "vitest";
import { cleanText, isHttpUrl, parseRequest, publicError } from "@/lib/requests";

const now = 1_800_000_000_000;
const valid = {
  type: "edit",
  slug: "spinny",
  contact: "Person@Example.com",
  fields: { field: "website", correct_value: "https://spinny.com", source: "https://spinny.com/about" },
  started_at: now - 10_000,
};

describe("parseRequest", () => {
  it("accepts a well-formed edit and normalises the email", () => {
    const r = parseRequest(valid, now);
    expect(r.ok).toBe(true);
    if (r.ok === true) {
      expect(r.value.contact).toBe("person@example.com");
      expect(r.value.slug).toBe("spinny");
    }
  });
  it("treats the honeypot as spam without telling the bot", () => {
    expect(parseRequest({ ...valid, company_website_confirm: "x" }, now).ok).toBe("spam");
  });
  it("rejects forms submitted faster than a human could", () => {
    expect(parseRequest({ ...valid, started_at: now - 500 }, now).ok).toBe(false);
    expect(parseRequest({ ...valid, started_at: undefined }, now).ok).toBe(false);
    expect(parseRequest({ ...valid, started_at: "NaN" }, now).ok).toBe(false);
  });
  it.each([null, "x", 42, [], { ...valid, fields: [] }, { ...valid, fields: "a" }])("rejects malformed body %j", (b) => {
    expect(parseRequest(b, now).ok).toBe(false);
  });
  it("rejects unknown request types", () => {
    expect(parseRequest({ ...valid, type: "approve" }, now).ok).toBe(false);
    expect(parseRequest({ ...valid, type: "__proto__" }, now).ok).toBe(false);
  });
  it.each(["../admin", "SPINNY", "a b", "x".repeat(81), "spinny;drop table"])("rejects bad slug %j", (slug) => {
    expect(parseRequest({ ...valid, slug }, now).ok).toBe(false);
  });
  it.each(["", "nope", "a@b", "a b@c.de", "<script>@x.io"])("rejects bad email %j", (contact) => {
    expect(parseRequest({ ...valid, contact }, now).ok).toBe(false);
  });
  it("rejects javascript: and data: links", () => {
    expect(parseRequest({ ...valid, fields: { source: "javascript:alert(1)" } }, now).ok).toBe(false);
    expect(parseRequest({ ...valid, fields: { website: "data:text/html,<b>x</b>" } }, now).ok).toBe(false);
  });
  it("drops non-string values and odd keys, and caps field count and length", () => {
    const fields: Record<string, unknown> = { ok: "yes", "Bad-Key": "x", nested: { a: 1 }, __proto__x: "y", long: "a".repeat(5000) };
    for (let i = 0; i < 30; i++) fields[`f_${String.fromCharCode(97 + (i % 26))}${i > 25 ? "x" : ""}`] = "v";
    const r = parseRequest({ ...valid, fields }, now);
    expect(r.ok).toBe(true);
    if (r.ok === true) {
      expect(r.value.payload.ok).toBe("yes");
      expect(r.value.payload["Bad-Key"]).toBeUndefined();
      expect(r.value.payload.nested).toBeUndefined();
      expect(r.value.payload.long.length).toBe(1500);
      expect(Object.keys(r.value.payload).length).toBeLessThanOrEqual(12);
    }
  });
  it("doesn't need an organisation for new submissions", () => {
    const r = parseRequest({ ...valid, type: "submit", slug: undefined }, now);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.slug).toBeNull();
  });
});

describe("helpers", () => {
  it("cleanText strips control characters but keeps newlines", () => {
    expect(cleanText(" a\u0000b\u0007c\nd ")).toBe("abc\nd");
  });
  it("isHttpUrl only allows http(s)", () => {
    expect(isHttpUrl("https://a.com")).toBe(true);
    expect(isHttpUrl("ftp://a.com")).toBe(false);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
  });
  it("publicError never leaks unknown database errors", () => {
    expect(publicError('relation "secret_table" does not exist').error).toBe("Could not save the request.");
    expect(publicError("too many requests, try again later").status).toBe(400);
  });
});

describe("event suggestions", () => {
  const now = Date.parse("2026-10-08T06:00:00Z");
  const ev = (fields: Record<string, string>) =>
    parseRequest({ type: "event", contact: "host@example.com", started_at: now - 10_000, fields }, now);
  const good = { title: "AI Meetup", starts_at: "2026-10-20T18:30", url: "https://lu.ma/ai", city: "Gurugram" };

  it("accepts a well-formed event without an organisation", () => {
    const r = ev(good);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.slug).toBeNull();
  });

  it("needs a name, a link and a start time in range", () => {
    expect(ev({ ...good, title: "" })).toMatchObject({ ok: false, error: "Give the event a name." });
    expect(ev({ ...good, url: "" })).toMatchObject({ ok: false, error: "Add a link to the event page." });
    expect(ev({ ...good, url: "javascript:alert(1)" })).toMatchObject({ ok: false, status: 400 });
    expect(ev({ ...good, starts_at: "next week" })).toMatchObject({ ok: false, error: "Pick a start date and time." });
    expect(ev({ ...good, starts_at: "2020-01-01T10:00" })).toMatchObject({ ok: false, error: "The event should be in the next two years." });
    expect(ev({ ...good, starts_at: "2031-01-01T10:00" })).toMatchObject({ ok: false, error: "The event should be in the next two years." });
    expect(ev({ ...good, ends_at: "2026-10-20T17:00" })).toMatchObject({ ok: false, error: "The end time should be after the start." });
    expect(ev({ ...good, ends_at: "2026-10-20T21:00" }).ok).toBe(true);
  });
});
