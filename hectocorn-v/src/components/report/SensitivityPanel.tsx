"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { SensitivityScenario } from "@/lib/engine/types";
import type { WhatIf } from "@/lib/engine/sensitivity";
import { REGION_LABELS, STAGE_LABELS } from "@/lib/schema/labels";
import type { StartupInput } from "@/lib/schema/startup";
import { formatUsd } from "@/lib/utils";

interface WhatIfResponse {
  result: {
    preMoneyUsd: number;
    lowUsd: number;
    highUsd: number;
    stage: string;
    confidence: number;
    flags: string[];
  };
  deltaUsd: number;
  deltaPct: number;
}

export function SensitivityPanel({
  reportId,
  input,
  basePreMoneyUsd,
  scenarios,
}: {
  reportId: string;
  input: StartupInput;
  basePreMoneyUsd: number;
  scenarios: SensitivityScenario[];
}) {
  const initial = useMemo<
    Required<
      Pick<
        WhatIf,
        | "arrUsd"
        | "payingCustomers"
        | "patentsGranted"
        | "operatingCountriesCount"
        | "momGrowthPct"
        | "runwayMonths"
        | "hqRegion"
      >
    >
  >(
    () => ({
      arrUsd: input.traction.arrUsd,
      payingCustomers: input.traction.payingCustomers,
      patentsGranted: input.ip.patentsGranted,
      operatingCountriesCount: input.operatingCountries.length,
      momGrowthPct: input.traction.momGrowthPct ?? 0,
      runwayMonths: Math.round(
        input.financials.cashOnHandUsd / Math.max(input.financials.monthlyBurnUsd, 1),
      ),
      hqRegion: input.hqRegion,
    }),
    [input],
  );
  const [w, setW] = useState(initial);
  const [res, setRes] = useState<WhatIfResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const dirty = JSON.stringify(w) !== JSON.stringify(initial);

  useEffect(() => {
    if (!dirty) {
      setRes(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setBusy(true);
      try {
        const r = await fetch("/api/sensitivity", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reportId, whatIf: w }),
          signal: ctrl.signal,
        });
        if (r.ok) setRes((await r.json()) as WhatIfResponse);
      } catch {
        // aborted or network error
      } finally {
        if (abortRef.current === ctrl) setBusy(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [w, dirty, reportId]);

  const maxAbs = Math.max(1, ...scenarios.map((s) => Math.abs(s.deltaUsd)));

  return (
    <section
      className="rounded-lg border bg-card p-6 shadow-sm md:p-8"
      aria-labelledby="sens-title"
    >
      <h2 id="sens-title" className="text-xl font-semibold tracking-[-0.5px]">
        Sensitivity
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        One variable at a time, everything else held. Deltas are against the engine base of{" "}
        {formatUsd(basePreMoneyUsd)}.
      </p>

      <ul className="space-y-2" aria-label="Preset scenarios">
        {scenarios.map((s) => {
          const pct = (Math.abs(s.deltaUsd) / maxAbs) * 100;
          return (
            <li
              key={s.key}
              className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm"
            >
              <span className="truncate" title={s.description}>
                {s.label}
              </span>
              <div className="relative h-3 rounded-full bg-secondary">
                {s.deltaUsd !== 0 ? (
                  <div
                    className={`absolute top-0 h-3 rounded-full ${s.deltaUsd > 0 ? "bg-primary" : "bg-muted-foreground"}`}
                    style={
                      s.deltaUsd > 0
                        ? { left: "50%", width: `${pct / 2}%` }
                        : { right: "50%", width: `${pct / 2}%` }
                    }
                  />
                ) : null}
                <div className="absolute left-1/2 top-0 h-3 w-px bg-border" />
              </div>
              <span
                className={`w-28 text-right tabular-nums ${s.noop ? "text-muted-foreground" : ""}`}
              >
                {s.noop
                  ? "no effect"
                  : `${s.deltaUsd > 0 ? "+" : ""}${formatUsd(s.deltaUsd)} (${s.deltaPct > 0 ? "+" : ""}${s.deltaPct}%)`}
                {s.stage !== scenarios[0]?.stage && !s.noop ? "" : ""}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_16rem]">
        <div className="grid gap-6 sm:grid-cols-2">
          <SliderField
            label="ARR"
            value={w.arrUsd}
            min={0}
            max={Math.max(5e6, initial.arrUsd * 3)}
            step={10_000}
            format={(v) => formatUsd(v)}
            onChange={(v) => setW({ ...w, arrUsd: v })}
          />
          <SliderField
            label="Paying customers"
            value={w.payingCustomers}
            min={0}
            max={Math.max(50, initial.payingCustomers * 3)}
            step={1}
            format={String}
            onChange={(v) => setW({ ...w, payingCustomers: v })}
          />
          <SliderField
            label="MoM growth"
            value={w.momGrowthPct}
            min={-10}
            max={40}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => setW({ ...w, momGrowthPct: v })}
          />
          <SliderField
            label="Runway"
            value={w.runwayMonths}
            min={0}
            max={36}
            step={1}
            format={(v) => `${v} months`}
            onChange={(v) => setW({ ...w, runwayMonths: v })}
          />
          <SliderField
            label="Patents granted"
            value={w.patentsGranted}
            min={0}
            max={10}
            step={1}
            format={String}
            onChange={(v) => setW({ ...w, patentsGranted: v })}
          />
          <SliderField
            label="Operating countries"
            value={w.operatingCountriesCount}
            min={0}
            max={20}
            step={1}
            format={String}
            onChange={(v) => setW({ ...w, operatingCountriesCount: v })}
          />
          <div className="space-y-2">
            <Label htmlFor="whatif-region">HQ region</Label>
            <Select
              value={w.hqRegion}
              onValueChange={(v) => setW({ ...w, hqRegion: v as StartupInput["hqRegion"] })}
            >
              <SelectTrigger id="whatif-region">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(REGION_LABELS).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="rounded-lg bg-secondary p-4" aria-live="polite">
          <p className="text-xs text-muted-foreground">What-if pre-money</p>
          <p className="text-3xl font-bold" data-testid="whatif-number">
            {res ? formatUsd(res.result.preMoneyUsd) : formatUsd(basePreMoneyUsd)}
          </p>
          {res ? (
            <p
              className={`text-sm ${res.deltaUsd >= 0 ? "text-foreground" : "text-muted-foreground"}`}
            >
              {res.deltaUsd >= 0 ? "+" : ""}
              {formatUsd(res.deltaUsd)} ({res.deltaPct >= 0 ? "+" : ""}
              {res.deltaPct.toFixed(1)}%) · {STAGE_LABELS[res.result.stage] ?? res.result.stage} ·
              confidence {res.result.confidence}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Move a slider to re-run the engine live.
            </p>
          )}
          {busy ? <p className="mt-2 text-xs text-muted-foreground">Recomputing…</p> : null}
          {dirty ? (
            <button
              type="button"
              className="mt-3 text-xs underline-offset-4 hover:underline"
              onClick={() => setW(initial)}
            >
              Reset to actual inputs
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-sm tabular-nums text-muted-foreground">{format(value)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        aria-label={label}
      />
    </div>
  );
}
