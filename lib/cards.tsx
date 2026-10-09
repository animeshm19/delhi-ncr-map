import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { anchorOf, getArea, getOrgs } from "@/lib/data";
import { score } from "@/lib/explorer";
import { haversineMeters } from "@/lib/geo";
import { fetchOrgLogo } from "@/lib/logo-fetch";
import { formatDistance, getStation, lineOf, stationsByDistance, walkMinutes } from "@/lib/metro";
import { CITIES, SITE_URL } from "@/lib/site";
import { KINDS, SECTORS, sectorColor, sectorLabel } from "@/lib/taxonomy";
import type { Org } from "@/lib/types";

/**
 * Instagram-ready cards: a 4:5 post (1080×1350) and a 9:16 story (1080×1920),
 * for a view of the map (a station, a sector, a city) or for one company.
 */
export type CardFormat = "post" | "story";
export const CARD_SIZES: Record<CardFormat, { width: number; height: number }> = {
  post: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
};
export const RADII = [500, 1000, 2000];

const BG = "#07080b";
const INK = "#f2f4f7";
const MUTED = "#9aa3ae";
const LINE = "#232833";

let fontsPromise: Promise<{ name: string; data: ArrayBuffer; weight: 400 | 600 | 800; style: "normal" }[]> | null = null;
function fonts() {
  fontsPromise ??= Promise.all(
    ([400, 600, 800] as const).map(async (weight) => {
      const buf = await readFile(path.join(process.cwd(), "assets/fonts", `inter-latin-${weight}-normal.woff`));
      return { name: "Inter", data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight, style: "normal" as const };
    }),
  );
  return fontsPromise;
}

type Tile = { name: string; src: string | null; color: string };

/** Logos for the best-known organisations first; satori draws PNG and JPEG, so others fall back to initials. */
async function tiles(orgs: Org[], n: number): Promise<Tile[]> {
  const ranked = [...orgs].sort((a, b) => score(b) - score(a)).slice(0, n * 2);
  const fetched = await Promise.all(
    ranked.map(async (o) => {
      const img = await fetchOrgLogo(o);
      const ok = img && /^image\/(png|jpeg)$/.test(img.type);
      return {
        name: o.name,
        src: ok ? `data:${img!.type};base64,${Buffer.from(img!.bytes).toString("base64")}` : null,
        color: o.kind === "company" ? sectorColor(o.sectors[0]) : KINDS[o.kind].color,
      };
    }),
  );
  // Real logos lead; the wall is filled with initials only if there aren't enough.
  return [...fetched.filter((t) => t.src), ...fetched.filter((t) => !t.src)].slice(0, n);
}

const host = () => SITE_URL.replace(/^https?:\/\//, "");
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const initialsOf = (name: string) =>
  name.replace(/\(.*?\)/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

function Brand({ accent }: { accent: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
      <div style={{ display: "flex", width: 44, height: 44, borderRadius: 22, background: accent, alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", width: 16, height: 16, borderRadius: 8, background: BG }} />
      </div>
      <div style={{ display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: 4, color: INK }}>DELHI NCR MAP</div>
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 24px", borderRadius: 999, border: `2px solid ${color}`, color: INK, fontSize: 28, fontWeight: 600 }}>
      <div style={{ display: "flex", width: 14, height: 14, borderRadius: 7, background: color }} />
      {label}
    </div>
  );
}

function LogoTile({ t, size }: { t: Tile; size: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: size + 24 }}>
      {t.src ? (
        <div style={{ display: "flex", width: size, height: size, borderRadius: size * 0.24, background: "#fff", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 3px ${t.color}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.src} width={size * 0.62} height={size * 0.62} style={{ objectFit: "contain" }} alt="" />
        </div>
      ) : (
        <div style={{ display: "flex", width: size, height: size, borderRadius: size * 0.24, background: `${t.color}33`, border: `3px solid ${t.color}`, alignItems: "center", justifyContent: "center", color: t.color, fontSize: size * 0.34, fontWeight: 800 }}>
          {initialsOf(t.name)}
        </div>
      )}
      <div style={{ display: "flex", fontSize: 22, color: MUTED, fontWeight: 600, justifyContent: "center", width: size + 24, whiteSpace: "nowrap", overflow: "hidden" }}>{clip(t.name, 14)}</div>
    </div>
  );
}

function Glow({ color, format }: { color: string; format: CardFormat }) {
  const { width, height } = CARD_SIZES[format];
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width,
        height,
        display: "flex",
        backgroundImage: `radial-gradient(circle at 85% 8%, ${color}55 0%, ${color}00 45%), radial-gradient(circle at 0% 100%, ${color}26 0%, ${color}00 40%)`,
      }}
    />
  );
}

/** A metro line with a station on it, in the line's colours (decoration for station cards). */
function MetroStrip({ colors, name }: { colors: string[]; name: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
      {colors.map((c) => (
        <div key={c} style={{ display: "flex", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex", flex: 1, height: 12, background: c, borderRadius: 6 }} />
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "center", marginTop: -((colors.length * 22) / 2) - 26 }}>
        <div style={{ display: "flex", width: 52, height: 52, borderRadius: 26, background: BG, border: `8px solid ${INK}` }} />
      </div>
      <div style={{ display: "flex", justifyContent: "center", fontSize: 30, fontWeight: 800, color: INK, marginTop: 6 }}>{name}</div>
    </div>
  );
}

export type ViewParams = { station?: string | null; r?: number | null; sector?: string | null; city?: string | null };

/** A card for a view of the map: companies near a station, in a sector, in a city, or everywhere. */
export async function viewCard(p: ViewParams, format: CardFormat) {
  const all = (await getOrgs()).filter((o) => o.kind === "company");
  const station = getStation(p.station ?? null);
  const r = p.r && RADII.includes(p.r) ? p.r : 1000;
  const sector = p.sector && SECTORS[p.sector] ? p.sector : null;
  const city = p.city && CITIES.some((c) => c.live && c.name === p.city) ? p.city : null;

  let list = all;
  if (sector) list = list.filter((o) => o.sectors.includes(sector));
  if (city) list = list.filter((o) => o.municipality === city);
  if (station) {
    list = list.filter((o) => {
      const a = anchorOf(o);
      return a ? haversineMeters(a, [station.lng, station.lat]) <= r : false;
    });
  }
  const n = list.length;
  const what = sector ? `${sectorLabel(sector).toLowerCase()} ${n === 1 ? "startup" : "startups"}` : n === 1 ? "startup" : "startups";
  const lines = station ? station.lines.map((l) => lineOf(l)!).filter(Boolean) : [];
  const accent = station ? lines[0]?.color ?? "#7cc4ff" : sector ? sectorColor(sector) : "#7cc4ff";
  const headline = n === 0
    ? `${station ? `${station.name} metro` : city ?? "This area"}: startups being mapped next`
    : station
    ? `${what} within ${formatDistance(r)} of ${station.name} metro`
    : city
      ? `${what} in ${city}`
      : `${what} across Delhi NCR`;
  const chips = station
    ? lines.map((l) => ({ label: l.name, color: l.color }))
    : [
        ...(city ? [{ label: city, color: accent }] : [{ label: "Gurugram · Noida · Greater Noida", color: accent }]),
        ...(sector ? [] : [{ label: "13 metro lines", color: "#f2c40c" }]),
      ];

  // Five logos a row; fewer rows when the metro strip takes space.
  const per = 5 * (format === "story" ? (station ? 2 : 3) : station ? 1 : 2);
  const wall = await tiles(list, per);
  const more = n - wall.length;
  const { width, height } = CARD_SIZES[format];
  const story = format === "story";

  return new ImageResponse(
    (
      <div style={{ width, height, display: "flex", flexDirection: "column", background: BG, color: INK, fontFamily: "Inter", position: "relative", padding: story ? "180px 72px 220px" : "72px 72px 64px" }}>
        <Glow color={accent} format={format} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Brand accent={accent} />
          <div style={{ display: "flex", fontSize: 24, color: MUTED, fontWeight: 600 }}>{new Date().toLocaleString("en-IN", { month: "short", year: "numeric" })}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: story ? 90 : 56 }}>
          <div style={{ display: "flex", fontSize: n === 0 ? 180 : n >= 100 ? 210 : 240, fontWeight: 800, lineHeight: 1, letterSpacing: n === 0 ? -4 : -10, color: INK }}>{n === 0 ? "Soon" : n}</div>
          <div style={{ display: "flex", fontSize: story ? 64 : 56, fontWeight: 600, lineHeight: 1.15, marginTop: 18, maxWidth: 900 }}>{clip(headline, 80)}</div>
          <div style={{ display: "flex", gap: 14, marginTop: 30, flexWrap: "wrap" }}>
            {chips.slice(0, 3).map((c) => <Chip key={c.label} label={c.label} color={c.color} />)}
          </div>
        </div>

        {station && (
          <div style={{ display: "flex", marginTop: story ? 70 : 40 }}>
            <MetroStrip colors={lines.slice(0, 3).map((l) => l.color)} name={station.name} />
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", rowGap: 28, columnGap: 12, marginTop: story ? 80 : station ? 36 : 56, justifyContent: "flex-start" }}>
          {wall.map((t) => <LogoTile key={t.name} t={t} size={150} />)}
        </div>

        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderTop: `2px solid ${LINE}`, paddingTop: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 800 }}>{more > 0 ? `+${more} more on the map` : "See them all on the map"}</div>
            <div style={{ display: "flex", fontSize: 24, color: MUTED }}>Free and open data</div>
          </div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 800, color: accent, whiteSpace: "nowrap" }}>{host()}</div>
        </div>
      </div>
    ),
    { ...CARD_SIZES[format], fonts: await fonts() },
  );
}

/** A card for one company: "we're on the map". */
export async function companyCard(o: Org, format: CardFormat) {
  const color = o.kind === "company" ? sectorColor(o.sectors[0]) : KINDS[o.kind].color;
  const [logo] = await tiles([o], 1);
  const anchor = anchorOf(o);
  const near = anchor ? stationsByDistance(anchor[0], anchor[1]).find((s) => s.meters <= 3000) : undefined;
  const place = [getArea(o.area)?.name, o.municipality].filter(Boolean).join(", ");
  const facts: { k: string; v: string; c?: string }[] = [
    { k: "Where", v: place + (o.location_precision === "area" ? " (sector)" : "") },
    ...(near
      ? [
          { k: "Metro", v: near.station.name, c: lineOf(near.station.lines[0])?.color },
          { k: "Walk", v: `${formatDistance(near.meters)} · about ${walkMinutes(near.meters)} min` },
        ]
      : []),
    ...(o.founded_year ? [{ k: "Founded", v: String(o.founded_year) }] : []),
    ...(o.funding_note ? [{ k: "Funding", v: `${o.funding_note} disclosed` }] : []),
  ];
  const { width, height } = CARD_SIZES[format];
  const story = format === "story";
  const size = story ? 300 : 260;

  return new ImageResponse(
    (
      <div style={{ width, height, display: "flex", flexDirection: "column", background: BG, color: INK, fontFamily: "Inter", position: "relative", padding: story ? "180px 72px 220px" : "72px 72px 64px" }}>
        <Glow color={color} format={format} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Brand accent={color} />
          <div style={{ display: "flex", fontSize: 24, color: color, fontWeight: 800, letterSpacing: 3 }}>WE&apos;RE ON THE MAP</div>
        </div>

        <div style={{ display: "flex", marginTop: story ? 120 : 70 }}>
          {logo.src ? (
            <div style={{ display: "flex", width: size, height: size, borderRadius: size * 0.22, background: "#fff", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 6px ${color}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo.src} width={size * 0.64} height={size * 0.64} style={{ objectFit: "contain" }} alt="" />
            </div>
          ) : (
            <div style={{ display: "flex", width: size, height: size, borderRadius: size * 0.22, background: `${color}33`, border: `6px solid ${color}`, alignItems: "center", justifyContent: "center", color, fontSize: size * 0.36, fontWeight: 800 }}>
              {initialsOf(o.name)}
            </div>
          )}
        </div>

        <div style={{ display: "flex", fontSize: o.name.length > 18 ? 84 : 110, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3, marginTop: 48 }}>{clip(o.name, 36)}</div>
        <div style={{ display: "flex", gap: 14, marginTop: 24, flexWrap: "wrap" }}>
          {(o.kind === "company" ? o.sectors.slice(0, 2).map((s) => ({ label: sectorLabel(s), color: sectorColor(s) })) : [{ label: KINDS[o.kind].label, color }]).map((c) => (
            <Chip key={c.label} label={c.label} color={c.color} />
          ))}
        </div>
        {o.one_liner && <div style={{ display: "flex", fontSize: story ? 46 : 40, lineHeight: 1.3, color: "#cfd5dd", marginTop: 34, maxWidth: 920 }}>{clip(o.one_liner, 120)}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: story ? 70 : 44 }}>
          {facts.map((f) => (
            <div key={f.k} style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 32 }}>
              <div style={{ display: "flex", width: 150, color: MUTED, fontWeight: 600, fontSize: 26, letterSpacing: 2 }}>{f.k.toUpperCase()}</div>
              {f.c && <div style={{ display: "flex", width: 16, height: 16, borderRadius: 8, background: f.c }} />}
              <div style={{ display: "flex", fontWeight: 600, whiteSpace: "nowrap" }}>{clip(f.v, 40)}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderTop: `2px solid ${LINE}`, paddingTop: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 800 }}>Find us on the Delhi NCR Map</div>
            <div style={{ display: "flex", fontSize: 24, color: MUTED }}>Every startup in Delhi NCR</div>
          </div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 800, color, whiteSpace: "nowrap" }}>{host()}</div>
        </div>
      </div>
    ),
    { ...CARD_SIZES[format], fonts: await fonts() },
  );
}
