import Link from "next/link";
import { getArea } from "@/lib/data";
import { formatEventTime, istDay } from "@/lib/time";
import type { EventItem } from "@/lib/types";

/** Events grouped by IST day. Server component: everything is rendered as text. */
export default function EventList({ events }: { events: EventItem[] }) {
  const days = new Map<string, EventItem[]>();
  for (const e of events) {
    const d = istDay(new Date(e.starts_at));
    days.set(d, [...(days.get(d) ?? []), e]);
  }
  return (
    <div className="events">
      {[...days].map(([day, list]) => (
        <section key={day} aria-label={day}>
          <h3 className="event-day">
            {new Date(`${day}T12:00:00+05:30`).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long" })}
          </h3>
          <ul className="roles">
            {list.map((e) => {
              const area = getArea(e.area);
              return (
                <li key={e.id} className="role event" data-testid={`event-${e.id}`}>
                  <div>
                    <a href={e.url} rel="noopener nofollow" target="_blank" className="role-title">{e.title}</a>
                    <div className="muted">
                      {formatEventTime(new Date(e.starts_at), e.ends_at ? new Date(e.ends_at) : null)}
                      {" · "}
                      {[e.venue, area?.name, e.city].filter(Boolean).join(", ")}
                      {e.organizer && <> · by {e.organizer}</>}
                    </div>
                    {e.description && <p className="event-desc">{e.description}</p>}
                  </div>
                  <Link href={`/events/${e.id}/ics`} className="chip" prefetch={false} aria-label={`Add ${e.title} to your calendar`}>
                    + Calendar
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
