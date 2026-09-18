/**
 * The Hectocorn V mark: a black (#0f172a, slate-900) rounded square with a
 * white bold "V". Inline SVG so it scales crisply and needs no asset request.
 */
export function HectocornVMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-label="Hectocorn V"
      role="img"
      className={className}
    >
      <rect width="32" height="32" rx="8" fill="#0f172a" />
      <path
        d="M8 8 L16 25 L24 8"
        stroke="#ffffff"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
