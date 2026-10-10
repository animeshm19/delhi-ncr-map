/** delhincr-map mark: a map pin holding Delhi, Gurugram and Noida as one connected network (placed as on the map). */
export default function Logo({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <path d="M16 30.5S5.5 20.4 5.5 12.8a10.5 10.5 0 0 1 21 0C26.5 20.4 16 30.5 16 30.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 8.6 11.4 15.6 20.8 14.2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" opacity=".55" />
      <circle cx="11.4" cy="15.6" r="2" fill="currentColor" />
      <circle cx="20.8" cy="14.2" r="2" fill="currentColor" />
      <circle cx="16" cy="8.6" r="2.6" fill="var(--logo-accent, #7cc4ff)" />
    </svg>
  );
}
