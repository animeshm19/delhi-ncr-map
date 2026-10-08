import { ImageResponse } from "next/og";

/** Share-preview cards (1200×630) for the site and each profile. Text only: no remote images are fetched. */
export const OG_SIZE = { width: 1200, height: 630 };

export function ogCard({
  eyebrow,
  title,
  subtitle,
  chips = [],
  accent = "#7cc4ff",
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string | null;
  chips?: { label: string; color?: string }[];
  accent?: string;
  footer: string;
}) {
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "#0a0b0d",
          color: "#e8eaed",
          fontFamily: "sans-serif",
          borderTop: `12px solid ${accent}`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 28, color: "#9aa0a6", letterSpacing: 2, textTransform: "uppercase" }}>{clip(eyebrow, 60)}</div>
          <div style={{ fontSize: title.length > 28 ? 64 : 84, fontWeight: 700, lineHeight: 1.05 }}>{clip(title, 60)}</div>
          {subtitle && <div style={{ fontSize: 34, color: "#c9ced6", lineHeight: 1.3 }}>{clip(subtitle, 140)}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", maxWidth: 820 }}>
            {chips.slice(0, 4).map((c) => (
              <div
                key={c.label}
                style={{
                  display: "flex",
                  fontSize: 24,
                  padding: "8px 18px",
                  borderRadius: 999,
                  border: `2px solid ${c.color ?? "#262a33"}`,
                  color: c.color ?? "#e8eaed",
                }}
              >
                {clip(c.label, 30)}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 28, color: accent, fontWeight: 700 }}>{footer}</div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
