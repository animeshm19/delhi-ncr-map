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
        <Link href="/about">About and methodology</Link>
        <Link href="/data">Open data</Link>
      </p>
      <p>
        Data CC BY 4.0 · Code MIT · Map data ©{" "}
        <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>, served by{" "}
        <a href="https://openfreemap.org">OpenFreeMap</a> with <a href="https://openmaptiles.org">OpenMapTiles</a>
      </p>
    </footer>
  );
}
