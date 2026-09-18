import { FX_TO_USD, type Currency } from "./benchmarks";
import type { StartupInput } from "@/lib/schema/startup";

/**
 * Returns a deep copy of the input with every `*Usd` amount converted from the
 * reporting currency into USD using the static FX table, and the reporting
 * currency set to USD. The engine always works in USD.
 */
export function toUsd(input: StartupInput): StartupInput {
  const rate = FX_TO_USD[input.reportingCurrency as Currency] ?? 1;
  if (rate === 1) return structuredClone(input);
  const converted = convertAmounts(structuredClone(input), rate) as StartupInput;
  converted.reportingCurrency = "USD";
  return converted;
}

/** Convert a USD amount back into a display currency. */
export function fromUsd(amountUsd: number, currency: Currency): number {
  return amountUsd / (FX_TO_USD[currency] ?? 1);
}

function convertAmounts(value: unknown, rate: number): unknown {
  if (Array.isArray(value)) return value.map((v) => convertAmounts(v, rate));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.endsWith("Usd") && typeof v === "number") out[k] = v * rate;
      else out[k] = convertAmounts(v, rate);
    }
    return out;
  }
  return value;
}
