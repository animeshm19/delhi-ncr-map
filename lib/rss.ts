/** Minimal RSS 2.0 writer. Every value is XML-escaped; invalid XML characters are dropped. */

export type FeedItem = {
  title: string;
  link: string;
  guid: string;
  date: Date;
  description?: string | null;
  category?: string;
};

// Characters XML 1.0 forbids.
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g;

export function escapeXml(s: string) {
  return s
    .replace(INVALID_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildRss(opts: { title: string; link: string; self: string; description: string; items: FeedItem[] }) {
  const items = opts.items
    .map(
      (i) => `    <item>
      <title>${escapeXml(i.title)}</title>
      <link>${escapeXml(i.link)}</link>
      <guid isPermaLink="false">${escapeXml(i.guid)}</guid>
      <pubDate>${i.date.toUTCString()}</pubDate>${i.category ? `\n      <category>${escapeXml(i.category)}</category>` : ""}${
        i.description ? `\n      <description>${escapeXml(i.description)}</description>` : ""
      }
    </item>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(opts.title)}</title>
    <link>${escapeXml(opts.link)}</link>
    <atom:link href="${escapeXml(opts.self)}" rel="self" type="application/rss+xml"/>
    <description>${escapeXml(opts.description)}</description>
    <language>en-in</language>
${items}
  </channel>
</rss>
`;
}
