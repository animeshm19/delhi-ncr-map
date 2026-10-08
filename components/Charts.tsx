import type { Bar } from "@/lib/stats";

/** Horizontal bars as plain SVG (no JavaScript), with the numbers in a table for screen readers. */
export function BarChart({ data, title, unit = "companies" }: { data: Bar[]; title: string; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const row = 26;
  const labelW = 190;
  const width = 640;
  const barW = width - labelW - 48;
  const height = data.length * row + 4;
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}>
        {data.map((d, i) => {
          const w = Math.max(2, (d.value / max) * barW);
          const y = i * row + 2;
          return (
            <g key={d.key}>
              <text x={labelW - 8} y={y + 16} textAnchor="end" className="chart-label">{d.label}</text>
              <rect x={labelW} y={y + 3} width={w} height={row - 8} rx={3} fill={d.color ?? "var(--accent)"} />
              <text x={labelW + w + 6} y={y + 16} className="chart-value">{d.value}</text>
            </g>
          );
        })}
      </svg>
      <DataTable data={data} title={title} unit={unit} />
    </figure>
  );
}

/** Vertical columns, for a time series like founding years. */
export function ColumnChart({ data, title, unit = "companies" }: { data: Bar[]; title: string; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const width = 640;
  const height = 200;
  const pad = 22;
  const colW = (width - pad) / Math.max(1, data.length);
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${width} ${height + 24}`} role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`}>
        {data.map((d, i) => {
          const h = (d.value / max) * (height - pad);
          const x = pad / 2 + i * colW;
          return (
            <g key={d.key}>
              <rect x={x + 2} y={height - h} width={Math.max(2, colW - 4)} height={h} rx={2} fill="var(--accent)" opacity={d.value ? 1 : 0.15} />
              {d.value > 0 && <text x={x + colW / 2} y={height - h - 4} textAnchor="middle" className="chart-value">{d.value}</text>}
              {(i % 2 === 0 || data.length <= 14) && (
                <text x={x + colW / 2} y={height + 16} textAnchor="middle" className="chart-label small">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      <DataTable data={data} title={title} unit={unit} />
    </figure>
  );
}

function DataTable({ data, title, unit }: { data: Bar[]; title: string; unit: string }) {
  return (
    <details className="chart-data">
      <summary>Show the numbers</summary>
      <table className="orgs">
        <caption className="sr-only">{title}</caption>
        <thead><tr><th scope="col">{title}</th><th scope="col">{unit}</th></tr></thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}><td>{d.label}</td><td>{d.value}</td></tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
