"use client";

import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { SCORE_KEYS, type Scores } from "@/lib/engine/types";
import { SCORE_LABELS } from "@/lib/schema/labels";
import type { AiScoreResult } from "@/lib/ai/schemas";

const PRIMARY = "hsl(222.2 47.4% 11.2%)";
const MUTED = "hsl(215.4 16.3% 46.9%)";

export function ScoreRadar({ deterministic, ai }: { deterministic: Scores; ai?: AiScoreResult }) {
  const data = SCORE_KEYS.map((k) => ({
    key: k,
    label: SCORE_LABELS[k],
    deterministic: deterministic[k],
    ai: ai?.scores[k],
  }));
  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm" aria-labelledby="scores-title">
      <h2 id="scores-title" className="text-xl font-semibold tracking-[-0.5px]">
        Qualitative scores
      </h2>
      <p className="mb-2 text-sm text-muted-foreground">
        Seven 0–100 scores.{" "}
        {ai
          ? "Dashed: deterministic formula. Solid: AI scorer (used by the engine)."
          : "From the deterministic formula; the AI scorer was not available."}
      </p>
      <div className="h-72" role="img" aria-label="Radar of the seven qualitative scores">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%">
            <PolarGrid stroke="hsl(214.3 31.8% 91.4%)" />
            <PolarAngleAxis dataKey="label" tick={{ fill: MUTED, fontSize: 12 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                borderColor: "hsl(214.3 31.8% 91.4%)",
                fontSize: 13,
              }}
            />
            <Radar
              name="Deterministic"
              dataKey="deterministic"
              stroke={MUTED}
              strokeDasharray="5 4"
              strokeWidth={2}
              fill={MUTED}
              fillOpacity={0.08}
              dot={{ r: 3, fill: MUTED }}
            />
            {ai ? (
              <Radar
                name="AI scorer"
                dataKey="ai"
                stroke={PRIMARY}
                strokeWidth={2}
                fill={PRIMARY}
                fillOpacity={0.12}
                dot={{ r: 3, fill: PRIMARY }}
              />
            ) : null}
            <Legend wrapperStyle={{ fontSize: 12 }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1.5 font-medium">Score</th>
            <th className="py-1.5 text-right font-medium">Formula</th>
            {ai ? <th className="py-1.5 text-right font-medium">AI</th> : null}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key} className="border-b align-top last:border-0">
              <td className="py-1.5">
                <div>{d.label}</div>
                {ai?.rationale[d.key] ? (
                  <div className="text-xs text-muted-foreground">{ai.rationale[d.key]}</div>
                ) : null}
              </td>
              <td className="py-1.5 text-right tabular-nums">{d.deterministic}</td>
              {ai ? (
                <td className="py-1.5 text-right font-medium tabular-nums">
                  {d.ai}
                  {ai.largeDeviations.includes(d.key) ? (
                    <span className="ml-1 text-xs text-muted-foreground">(±20 exceeded)</span>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
