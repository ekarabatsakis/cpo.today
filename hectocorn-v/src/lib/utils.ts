import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Format a USD amount compactly: $1.2M, $850k, $12.5B. */
export function formatUsd(value: number, opts: { compact?: boolean } = { compact: true }): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (opts.compact !== false) {
    if (abs >= 1e9) return `$${(value / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}B`;
    if (abs >= 1e6) return `$${(value / 1e6).toFixed(abs >= 1e8 ? 0 : abs >= 1e7 ? 1 : 2)}M`;
    if (abs >= 1e3) return `$${(value / 1e3).toFixed(0)}k`;
  }
  return usdFormatter.format(value);
}

export function formatPct(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}
