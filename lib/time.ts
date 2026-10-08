/** Dates on the site are shown in India Standard Time, whatever the server's zone. */
export const TZ = "Asia/Kolkata";

export function formatEventTime(start: Date, end?: Date | null) {
  const day = start.toLocaleDateString("en-IN", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
  if (!end) return `${day}, ${t(start)}`;
  const sameDay = istDay(start) === istDay(end);
  return sameDay ? `${day}, ${t(start)}–${t(end)}` : `${day}, ${t(start)} to ${formatEventTime(end)}`;
}

/** YYYY-MM-DD of a moment in IST. */
export function istDay(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** "2026-10-20T18:30" (a datetime-local value, read as IST) → ISO with offset, or null. */
export function istLocalToIso(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const d = new Date(`${v}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : `${v}:00+05:30`;
}
