import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export default function SiteFooter() {
  return (
    <footer className="site">
      <p>
        {SITE_NAME}, an independent community project. Company names and logos are trademarks of
        their owners, shown for identification. Data compiled from public sources; request corrections or
        removal anytime.
      </p>
      <p className="actions">
        <Link href="/">Map</Link>
        <Link href="/directory">Directory</Link>
        <Link href="/hiring">Hiring</Link>
        <Link href="/metro">By metro</Link>
        <Link href="/events">Events</Link>
        <Link href="/this-week">This week</Link>
        <Link href="/stats">Stats</Link>
        <Link href="/submit">Submit a company</Link>
        <Link href="/about">About and methodology</Link>
        <Link href="/data">Open data</Link>
        <Link href="/account">Sign in</Link>
      </p>
      <p>
        Data CC BY 4.0 · Code MIT · Map data ©{" "}
        <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, served by{" "}
        <a href="https://openfreemap.org">OpenFreeMap</a> with <a href="https://openmaptiles.org">OpenMapTiles</a>
      </p>
      <p className="credit">
        Made by{" "}
        <a href="https://www.linkedin.com/in/animeshmittal/" rel="noopener" target="_blank">Animesh Mittal</a> · Inspired by{" "}
        <a href="https://map.techwednesdays.ca" rel="noopener" target="_blank">Edmonton Tech</a>
      </p>
    </footer>
  );
}
