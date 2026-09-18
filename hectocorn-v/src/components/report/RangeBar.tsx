import { lastPricedRound } from "@/lib/engine/helpers";
import { formatUsd } from "@/lib/utils";
import type { ReportPayload } from "@/types/report";

interface Marker {
  key: string;
  label: string;
  value: number;
  emphasis?: boolean;
}

/** Low / base / high bar with markers for the engine number, the last round and the market ceiling. */
export function RangeBar({ report }: { report: ReportPayload }) {
  const engine = report.effectiveEngine;
  if (!engine) return null;
  const final = report.finalPreMoneyUsd ?? engine.preMoneyUsd;
  const low = final * (engine.lowUsd / engine.preMoneyUsd);
  const high = final * (engine.highUsd / engine.preMoneyUsd);
  const markers: Marker[] = [{ key: "final", label: "Final", value: final, emphasis: true }];
  if (report.aiResult?.memo && engine.preMoneyUsd !== final) {
    markers.push({ key: "engine", label: "Engine", value: engine.preMoneyUsd });
  }
  const round = lastPricedRound(report.inputUsd);
  if (round?.postMoneyUsd)
    markers.push({ key: "round", label: "Last round post", value: round.postMoneyUsd });
  if (engine.marketCeilingUsd)
    markers.push({ key: "ceiling", label: "Market ceiling", value: engine.marketCeilingUsd });

  const values = [low, high, ...markers.map((m) => m.value)];
  const min = Math.min(...values) * 0.85;
  const max = Math.max(...values) * 1.1;
  const x = (v: number) => `${((v - min) / (max - min)) * 100}%`;

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm" aria-label="Valuation range">
      <div className="mb-8 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold tracking-[-0.5px]">Range</h2>
        <span className="text-sm text-muted-foreground">
          {formatUsd(low)} low · {formatUsd(final)} base · {formatUsd(high)} high
        </span>
      </div>
      <div className="relative h-24">
        <div className="absolute left-0 right-0 top-8 h-2 rounded-full bg-secondary" />
        <div
          className="absolute top-8 h-2 rounded-full bg-primary/30"
          style={{ left: x(low), width: `calc(${x(high)} - ${x(low)})` }}
        />
        <div
          className="absolute top-12 -translate-x-1/2 text-xs text-muted-foreground"
          style={{ left: x(low) }}
        >
          {formatUsd(low)}
        </div>
        <div
          className="absolute top-12 -translate-x-1/2 text-xs text-muted-foreground"
          style={{ left: x(high) }}
        >
          {formatUsd(high)}
        </div>
        {markers.map((m, i) => (
          <div
            key={m.key}
            className="absolute -translate-x-1/2"
            style={{ left: x(m.value), top: m.emphasis ? 0 : 4 }}
          >
            <div
              className={
                m.emphasis
                  ? "mx-auto h-6 w-1 rounded-full bg-primary"
                  : "mx-auto h-5 w-0.5 rounded-full bg-muted-foreground"
              }
              style={{ marginTop: m.emphasis ? 22 : 24 }}
            />
            <div
              className={`mt-1 whitespace-nowrap text-xs ${m.emphasis ? "font-semibold text-foreground" : "text-muted-foreground"}`}
              style={{ transform: `translateY(${i % 2 === 0 ? 0 : 14}px)` }}
            >
              {m.label} {formatUsd(m.value)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
