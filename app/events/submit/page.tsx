import type { Metadata } from "next";
import Link from "next/link";
import RequestForm from "@/components/RequestForm";
import SiteFooter from "@/components/SiteFooter";
import { REGION } from "@/lib/site";

export const metadata: Metadata = {
  title: "Suggest an event",
  description: `Suggest a startup or tech event in ${REGION} for the events calendar.`,
};

export default function SubmitEvent() {
  return (
    <main id="main" className="page">
      <nav className="crumbs"><Link href="/">Map</Link>/<Link href="/events">Events</Link>/<span>Suggest</span></nav>
      <h1>Suggest an event</h1>
      <p className="lede">
        Free and paid events are both welcome if they&apos;re for the {REGION} startup and tech community. A reviewer checks
        the event page before it&apos;s listed. Your email is never shown.
      </p>
      <RequestForm type="event" />
      <SiteFooter />
    </main>
  );
}
