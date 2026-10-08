import type { Metadata } from "next";
import Link from "next/link";
import EventList from "@/components/EventList";
import SiteFooter from "@/components/SiteFooter";
import { getEvents } from "@/lib/data";
import { REGION, SITE_URL } from "@/lib/site";

export const revalidate = 3600;
export const metadata: Metadata = {
  title: "Events",
  description: `Upcoming startup and tech events in ${REGION}: meetups, demo days, workshops and hackathons.`,
  alternates: { canonical: "/events", types: { "text/calendar": "/events.ics" } },
};

export default async function Events() {
  const events = await getEvents();
  const webcal = `${SITE_URL.replace(/^https?:/, "webcal:")}/events.ics`;
  return (
    <main id="main" className="page wide">
      <nav className="crumbs"><Link href="/">Map</Link>/<span>Events</span></nav>
      <h1>Events in {REGION}</h1>
      <p className="lede">
        Meetups, demo days, workshops and hackathons. Every event is checked by a person before it&apos;s listed.
      </p>
      <p className="actions">
        <Link href="/events/submit" className="btn">Suggest an event</Link>
        <a href={webcal} className="btn ghost">Subscribe in your calendar</a>
        <a href="/events.ics" className="muted">.ics feed</a>
        <a href="/feed.xml" className="muted">RSS</a>
      </p>
      {events.length > 0 ? <EventList events={events} /> : <p className="card muted">No upcoming events yet. Know of one? Suggest it.</p>}
      <SiteFooter />
    </main>
  );
}
