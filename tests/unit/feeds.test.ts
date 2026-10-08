import { describe, expect, it } from "vitest";
import { buildCalendar, escapeText, foldLine, icsDate } from "@/lib/ical";
import { buildRss, escapeXml } from "@/lib/rss";
import { formatEventTime, istDay, istLocalToIso } from "@/lib/time";
import { addedSinceLaunch } from "@/lib/launch";

describe("iCal", () => {
  it("escapes text so a title can't add properties", () => {
    expect(escapeText("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
    const cal = buildCalendar("Test", [
      { uid: "e1@x", title: "Evil\r\nATTENDEE:mailto:victim@example.com\nEND:VEVENT", start: new Date("2030-01-15T13:00:00Z") },
    ]);
    const lines = cal.split("\r\n");
    expect(lines.filter((l) => l === "END:VEVENT")).toHaveLength(1);
    expect(lines.some((l) => l.startsWith("ATTENDEE"))).toBe(false);
  });

  it("writes UTC times and defaults to a two-hour event", () => {
    const cal = buildCalendar("Test", [{ uid: "e1@x", title: "Meetup", start: new Date("2030-01-15T13:00:00Z") }], new Date("2026-10-08T00:00:00Z"));
    expect(cal).toContain("DTSTART:20300115T130000Z\r\n");
    expect(cal).toContain("DTEND:20300115T150000Z\r\n");
    expect(cal).toContain("DTSTAMP:20261008T000000Z\r\n");
    expect(cal.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(cal.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(icsDate(new Date("2030-01-15T13:00:00.123Z"))).toBe("20300115T130000Z");
  });

  it("folds long lines at 75 bytes without splitting characters", () => {
    const folded = foldLine("SUMMARY:" + "नमस्ते ".repeat(30));
    for (const line of folded.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "नमस्ते ".repeat(30));
  });

  it("only includes http(s) links", () => {
    const cal = buildCalendar("T", [{ uid: "1", title: "x", start: new Date(), url: "javascript:alert(1)" }]);
    expect(cal).not.toContain("javascript");
    const ok = buildCalendar("T", [{ uid: "1", title: "x", start: new Date(), url: "https://meetup.example/a" }]);
    expect(ok).toContain("URL:https://meetup.example/a\r\n");
  });
});

describe("RSS", () => {
  it("escapes markup and drops characters XML forbids", () => {
    expect(escapeXml(`<script>"&'\u0001`)).toBe("&lt;script&gt;&quot;&amp;&apos;");
    const xml = buildRss({
      title: "Feed",
      link: "https://x.example/",
      self: "https://x.example/feed.xml",
      description: "d",
      items: [{ title: "</title><script>alert(1)</script>", link: "https://x.example/c/a?b=1&c=2", guid: "g1", date: new Date("2026-10-08T00:00:00Z") }],
    });
    expect(xml).not.toContain("<script>");
    expect(xml).toContain("&lt;/title&gt;&lt;script&gt;");
    expect(xml).toContain("https://x.example/c/a?b=1&amp;c=2");
    expect(xml).toContain("<pubDate>Thu, 08 Oct 2026 00:00:00 GMT</pubDate>");
  });
});

describe("IST helpers", () => {
  it("reads form times as IST", () => {
    expect(istLocalToIso("2030-01-15T18:30")).toBe("2030-01-15T18:30:00+05:30");
    expect(istLocalToIso("2030-01-15 18:30")).toBeNull();
    expect(istLocalToIso("2030-02-31T18:30")).not.toBeNull(); // JS rolls over; the database re-validates
    expect(istLocalToIso("tomorrow")).toBeNull();
  });

  it("formats in IST regardless of server zone", () => {
    const start = new Date("2030-01-15T13:00:00Z");
    expect(istDay(new Date("2030-01-15T19:00:00Z"))).toBe("2030-01-16");
    expect(formatEventTime(start, new Date("2030-01-15T15:30:00Z"))).toMatch(/^Tue, 15 Jan,? 2030, 6:30\s?pm–9:00\s?pm$/i);
  });
});

describe("addedSinceLaunch", () => {
  it("treats the first hour's batch as the initial import", () => {
    const orgs = [
      { slug: "a", created_at: "2026-10-08T07:00:00Z" },
      { slug: "b", created_at: "2026-10-08T07:40:00Z" },
      { slug: "c", created_at: "2026-10-12T10:00:00Z" },
      { slug: "d", created_at: null },
    ];
    expect(addedSinceLaunch(orgs).map((o) => o.slug)).toEqual(["c"]);
    expect(addedSinceLaunch([])).toEqual([]);
  });
});
