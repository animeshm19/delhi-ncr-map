/**
 * Minimal RFC 5545 calendar writer for published events.
 * Text is escaped and long lines folded, so event titles can't inject properties.
 */

export type CalEvent = {
  uid: string;
  title: string;
  start: Date;
  end?: Date | null;
  location?: string | null;
  description?: string | null;
  url?: string | null;
  updated?: Date;
};

// Characters that aren't allowed in a content line (controls other than TAB).
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000a-\u001f\u007f]/g;

/** Escape a TEXT value: backslash, semicolon, comma and newlines. */
export function escapeText(s: string) {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(CONTROL, "");
}

/** Fold a content line at 75 octets (UTF-8), never splitting a character. */
export function foldLine(line: string) {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + n > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/** 20300115T130000Z */
export function icsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** A URI value: only http(s), no whitespace or control characters. */
function safeUri(u: string | null | undefined) {
  if (!u || !/^https?:\/\/[^\s<>"\\]+$/i.test(u)) return null;
  return u;
}

export function buildCalendar(name: string, events: CalEvent[], now = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//delhincr-map//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    "X-WR-TIMEZONE:Asia/Kolkata",
  ];
  for (const e of events) {
    const end = e.end ?? new Date(e.start.getTime() + 2 * 3600_000);
    const url = safeUri(e.url);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(e.uid)}`,
      `DTSTAMP:${icsDate(e.updated ?? now)}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${escapeText(e.title)}`,
    );
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    const desc = [e.description, url].filter(Boolean).join("\n\n");
    if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`);
    if (url) lines.push(`URL:${url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
