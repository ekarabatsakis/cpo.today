import { HectocornVMark } from "./HectocornVMark";
import { cn } from "@/lib/utils";

/**
 * "Hectocorn V" wordmark: "Hectocorn" in bold, a space, then the mark rendered
 * inline in place of the letter V.
 */
export function Wordmark({
  size = 28,
  className,
  textClassName,
}: {
  size?: number;
  className?: string;
  textClassName?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-2 text-foreground", className)}
      aria-label="Hectocorn V"
    >
      <span className={cn("font-bold leading-none tracking-tight", textClassName)}>Hectocorn</span>
      <HectocornVMark size={size} />
    </span>
  );
}
