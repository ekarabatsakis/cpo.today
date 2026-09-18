"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { EngineResult, MethodResult } from "@/lib/engine/types";
import { formatUsd } from "@/lib/utils";

const PRIMARY = "hsl(222.2 47.4% 11.2%)";
const MUTED = "hsl(215.4 16.3% 46.9%)";

export function MethodBreakdown({ engine }: { engine: EngineResult }) {
  const [open, setOpen] = useState<MethodResult | null>(null);
  const applicable = engine.methods.filter((m) => m.applicable && m.valuationUsd > 0);
  const skipped = engine.methods.filter((m) => !applicable.includes(m));
  const data = applicable.map((m) => ({
    key: m.key,
    name: m.name,
    value: m.valuationUsd,
    weight: engine.weights[m.key] ?? 0,
  }));
  const height = Math.max(160, data.length * 52 + 40);

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm" aria-labelledby="methods-title">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="methods-title" className="text-xl font-semibold tracking-[-0.5px]">
          Method breakdown
        </h2>
        <span className="text-sm text-muted-foreground">
          Weighted geometric mean → {formatUsd(engine.blendedUsd)}
          {engine.marketCeilingUsd && engine.flags.includes("market_ceiling_applied")
            ? `, capped at ${formatUsd(engine.marketCeilingUsd)}`
            : ""}
        </span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Click a method for the inputs it used and its notes. Pills show the blend weight.
      </p>

      <div
        style={{ height }}
        role="img"
        aria-label="Horizontal bars: pre-money valuation by method"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ left: 8, right: 72, top: 4, bottom: 4 }}
            barCategoryGap={12}
          >
            <CartesianGrid horizontal={false} stroke="hsl(214.3 31.8% 91.4%)" />
            <XAxis
              type="number"
              tickFormatter={(v: number) => formatUsd(v)}
              tick={{ fill: MUTED, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={150}
              tick={{ fill: "hsl(222.2 84% 4.9%)", fontSize: 13 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "hsl(210 40% 96.1%)" }}
              formatter={(v: number) => [formatUsd(v, { compact: false }), "Pre-money"]}
              contentStyle={{
                borderRadius: 8,
                borderColor: "hsl(214.3 31.8% 91.4%)",
                fontSize: 13,
              }}
            />
            <ReferenceLine
              x={engine.preMoneyUsd}
              stroke={MUTED}
              strokeDasharray="4 4"
              label={{ value: "Blend", position: "top", fill: MUTED, fontSize: 11 }}
            />
            <Bar
              dataKey="value"
              fill={PRIMARY}
              radius={[0, 4, 4, 0]}
              barSize={22}
              onClick={(entry: { key?: string }) => {
                const m = engine.methods.find((x) => x.key === entry.key);
                if (m) setOpen(m);
              }}
              className="cursor-pointer"
            >
              <LabelList
                dataKey="value"
                position="right"
                formatter={(v: number) => formatUsd(v)}
                style={{ fill: "hsl(222.2 84% 4.9%)", fontSize: 12 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 font-medium">Method</th>
            <th className="py-2 font-medium">Pre-money</th>
            <th className="py-2 font-medium">Weight</th>
            <th className="py-2 font-medium">Weight hint</th>
          </tr>
        </thead>
        <tbody>
          {engine.methods.map((m) => (
            <tr key={m.key} className="border-b last:border-0">
              <td className="py-2">
                <button
                  type="button"
                  className="text-left font-medium underline-offset-4 hover:underline"
                  onClick={() => setOpen(m)}
                >
                  {m.name}
                </button>
              </td>
              <td className="py-2">
                {m.applicable && m.valuationUsd > 0 ? (
                  formatUsd(m.valuationUsd)
                ) : (
                  <span className="text-muted-foreground">n/a</span>
                )}
              </td>
              <td className="py-2">
                {engine.weights[m.key] !== undefined ? (
                  <Badge variant="secondary">{Math.round(engine.weights[m.key] * 100)}%</Badge>
                ) : (
                  <Badge variant="outline">0%</Badge>
                )}
              </td>
              <td className="py-2 text-muted-foreground">
                {m.applicable ? m.weightHint.toFixed(2) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {skipped.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Not applicable: {skipped.map((m) => `${m.name} (${m.notes.at(-1) ?? "n/a"})`).join(" · ")}
        </p>
      ) : null}

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          {open ? (
            <>
              <SheetHeader>
                <SheetTitle>{open.name}</SheetTitle>
                <SheetDescription>
                  {open.applicable
                    ? `${formatUsd(open.valuationUsd, { compact: false })} pre-money`
                    : "Not applicable"}{" "}
                  · weight{" "}
                  {engine.weights[open.key] !== undefined
                    ? `${Math.round(engine.weights[open.key] * 100)}%`
                    : "0%"}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <div>
                  <h3 className="mb-2 text-sm font-medium">Notes</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {open.notes.map((n, i) => (
                      <li key={i} className="rounded-md bg-secondary p-2">
                        {n}
                      </li>
                    ))}
                  </ul>
                </div>
                {Object.keys(open.inputsUsed).length ? (
                  <div>
                    <h3 className="mb-2 text-sm font-medium">Inputs used</h3>
                    <table className="w-full text-sm">
                      <tbody>
                        {Object.entries(open.inputsUsed).map(([k, v]) => (
                          <tr key={k} className="border-b last:border-0">
                            <td className="py-1.5 pr-2 text-muted-foreground">{k}</td>
                            <td className="py-1.5 text-right font-mono text-xs">
                              {formatInput(k, v)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function formatInput(key: string, v: number | string | boolean | null): string {
  if (v === null) return "—";
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number")
    return key.endsWith("Usd") ? formatUsd(v, { compact: false }) : String(v);
  return v;
}
