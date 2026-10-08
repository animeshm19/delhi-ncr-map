import { supabase } from "@/lib/data";
import { buildCalendar } from "@/lib/ical";
import { getArea } from "@/lib/data";
import { SITE_NAME } from "@/lib/site";

// One event as an .ics file ("Add to calendar").
export const revalidate = 3600;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id) || !supabase) return new Response("Not found", { status: 404 });
  const { data: e } = await supabase
    .from("events")
    .select("id, title, starts_at, ends_at, venue, area, city, url, description, created_at")
    .eq("id", Number(id))
    .maybeSingle();
  if (!e) return new Response("Not found", { status: 404 });
  const body = buildCalendar(SITE_NAME, [
    {
      uid: `event-${e.id}@delhi-ncr-map`,
      title: e.title,
      start: new Date(e.starts_at),
      end: e.ends_at ? new Date(e.ends_at) : null,
      location: [e.venue, getArea(e.area)?.name, e.city].filter(Boolean).join(", "),
      description: e.description,
      url: e.url,
      updated: new Date(e.created_at),
    },
  ]);
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="event-${e.id}.ics"`,
    },
  });
}
