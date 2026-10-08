/**
 * "On Delhi NCR Map" badges as SVG, for companies to show on their own sites.
 * The name is XML-escaped and the SVG has no scripts, links or external references.
 */

const esc = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** Rough text width at 11px in the usual sans-serif fonts. */
export function textWidth(s: string) {
  let w = 0;
  for (const ch of s) w += /[A-Z0-9MW@#%&]/.test(ch) ? 7.4 : /[ilj.,:;'|!]/.test(ch) ? 3.4 : ch === " " ? 3.6 : 6.4;
  return Math.ceil(w);
}

export type BadgeTheme = "dark" | "light";

export function badgeSvg(opts: { label: string; value: string; color?: string; theme?: BadgeTheme }) {
  const label = opts.label.slice(0, 40);
  const value = opts.value.slice(0, 48);
  const color = /^#[0-9a-f]{6}$/i.test(opts.color ?? "") ? opts.color! : "#7cc4ff";
  const light = opts.theme === "light";
  const lw = textWidth(label) + 20;
  const vw = textWidth(value) + 20;
  const w = lw + vw;
  const title = `${label}: ${value}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="22" viewBox="0 0 ${w} 22" role="img" aria-label="${esc(title)}">
  <title>${esc(title)}</title>
  <rect width="${w}" height="22" rx="4" fill="${light ? "#ffffff" : "#0a0b0d"}" stroke="${light ? "#d0d4da" : "#262a33"}"/>
  <rect x="${lw}" width="${vw}" height="22" rx="4" fill="${color}"/>
  <rect x="${lw}" width="4" height="22" fill="${color}"/>
  <g font-family="Verdana,DejaVu Sans,sans-serif" font-size="11">
    <text x="10" y="15" fill="${light ? "#111317" : "#e8eaed"}">${esc(label)}</text>
    <text x="${lw + 10}" y="15" fill="#0a0b0d" font-weight="bold">${esc(value)}</text>
  </g>
</svg>
`;
}
