import { getArea, getEvents } from "@/lib/data";
import { buildCalendar } from "@/lib/ical";
import { REGION } from "@/lib/site";

// Subscribable calendar of upcoming events (webcal://…/events.ics).
export const revalidate = 3600;

export async function GET() {
  const events = await getEvents({ fromIso: new Date(Date.now() - 30 * 24 * 3600_000).toISOString(), limit: 500 });
  const body = buildCalendar(
    `${REGION} tech events`,
    events.map((e) => ({
      uid: `event-${e.id}@delhi-ncr-map`,
      title: e.title,
      start: new Date(e.starts_at),
      end: e.ends_at ? new Date(e.ends_at) : null,
      location: [e.venue, getArea(e.area)?.name, e.city].filter(Boolean).join(", "),
      description: [e.organizer && `Organised by ${e.organizer}`, e.description].filter(Boolean).join("\n\n"),
      url: e.url,
      updated: new Date(e.created_at),
    })),
  );
  return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8" } });
}
