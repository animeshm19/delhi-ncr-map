/**
 * Delhi Tech Map mark: India Gate in outline, with circuit traces rising through its arch to a glowing
 * node where the eternal flame burns. The outline draws itself in and the node pulses (no motion if the
 * visitor prefers reduced motion).
 */
export default function Logo({ size = 26, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={`gate-logo ${className}`} aria-hidden fill="none">
      <g className="logo-gate" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
        <path pathLength={1} d="M13 6.2Q16 2.6 19 6.2M9.5 6.2h13v2.8h-13zM6.5 9h19M7.5 11v16.5M24.5 11v16.5M7.5 11h17M4.5 27.5h23M11.5 27.5V17.5a4.5 4.5 0 0 1 9 0v10" />
      </g>
      <g className="logo-chip" stroke="var(--logo-accent, #7cc4ff)" strokeWidth="1.2" strokeLinecap="round">
        <path pathLength={1} d="M14 27.5v-4.5l-1-1M18 27.5v-4.5l1-1M16 27.5v-7.3" />
      </g>
      <circle cx="13" cy="21.6" r="1" fill="currentColor" />
      <circle cx="19" cy="21.6" r="1" fill="currentColor" />
      <circle className="logo-flame" cx="16" cy="19" r="1.7" fill="var(--logo-accent, #7cc4ff)" />
    </svg>
  );
}
