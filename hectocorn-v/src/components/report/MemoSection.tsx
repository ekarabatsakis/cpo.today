import { AlertCircle, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/utils";
import type { ReportPayload } from "@/types/report";

export function MemoSection({ report }: { report: ReportPayload }) {
  const ai = report.aiResult;
  const memo = ai?.memo;

  if (!memo) {
    return (
      <section className="rounded-lg border bg-card p-6 shadow-sm" aria-labelledby="memo-title">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <AlertCircle className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h2 id="memo-title" className="text-xl font-semibold tracking-[-0.5px]">
              AI memo not available
            </h2>
            <p className="text-sm text-muted-foreground">
              {report.aiStatus === "unavailable" && !ai
                ? "No ANTHROPIC_API_KEY was configured when this report ran, so it shows the deterministic engine result only. Add a key to .env to enable the qualitative scorer, the market estimator and the investment memo."
                : "The AI layer could not complete. The deterministic engine result stands."}
            </p>
            {ai?.errors.length ? (
              <ul className="text-xs text-muted-foreground">
                {ai.errors.map((e, i) => (
                  <li key={i}>
                    {e.stage}: {e.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  const { memo: m, adjustment, disclaimer } = memo;
  return (
    <section
      className="space-y-6 rounded-lg border bg-card p-6 shadow-sm md:p-8"
      aria-labelledby="memo-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h2 id="memo-title" className="text-xl font-semibold tracking-[-0.5px]">
              AI investment memo
            </h2>
            <p className="text-sm text-muted-foreground">
              Written by {ai?.model ?? "Claude"} · memo confidence {m.confidence}/100
              {ai?.errors.length
                ? ` · ${ai.errors.length} stage${ai.errors.length > 1 ? "s" : ""} failed`
                : ""}
            </p>
          </div>
        </div>
        <Badge variant={adjustment.appliedPct === 0 ? "secondary" : "default"}>
          Adjustment {adjustment.appliedPct > 0 ? "+" : ""}
          {adjustment.appliedPct}%{adjustment.clamped ? " (clamped)" : ""}
        </Badge>
      </div>

      <div className="rounded-lg bg-secondary p-4">
        <h3 className="mb-1 text-sm font-medium">Why the adjustment</h3>
        <p className="text-sm text-muted-foreground">{adjustment.rationale}</p>
        {adjustment.clamped ? (
          <p className="mt-2 text-xs text-muted-foreground">
            The model asked for {adjustment.requestedPct > 0 ? "+" : ""}
            {adjustment.requestedPct}%; the server clamped it to the ±25% band and recomputed the
            final number.
          </p>
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Summary</h3>
        <p className="text-base leading-relaxed">{m.summary}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium">Strengths</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            {m.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium">Risks</h3>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            {m.risks.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      </div>

      {m.comparables.length ? (
        <div>
          <h3 className="mb-2 text-sm font-medium">Comparables</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {m.comparables.map((c, i) => (
              <div key={i} className="rounded-lg border p-3 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{c.name}</span>
                  {c.indicativeValuation ? (
                    <span className="text-xs text-muted-foreground">{c.indicativeValuation}</span>
                  ) : null}
                </div>
                <p className="mt-1 text-muted-foreground">{c.whyRelevant}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {m.whatMovesTheNumber.length ? (
        <div>
          <h3 className="mb-2 text-sm font-medium">What moves the number</h3>
          <table className="w-full text-sm">
            <tbody>
              {m.whatMovesTheNumber.map((w, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="py-2">{w.lever}</td>
                  <td className="py-2 text-right font-medium tabular-nums">
                    {w.estimatedImpactPct > 0 ? "+" : ""}
                    {w.estimatedImpactPct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {m.recommendedRaise ? (
        <div className="rounded-lg border p-4 text-sm">
          <span className="font-medium">
            Recommended raise: {formatUsd(m.recommendedRaise.amountUsd)}.
          </span>{" "}
          <span className="text-muted-foreground">{m.recommendedRaise.rationale}</span>
        </div>
      ) : null}

      {ai?.scores?.notableSignals.length ? (
        <div>
          <h3 className="mb-2 text-sm font-medium">Notable signals</h3>
          <div className="flex flex-wrap gap-2">
            {ai.scores.notableSignals.map((s, i) => (
              <Badge key={i} variant="outline" className="font-normal">
                {s}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">{disclaimer}</p>
    </section>
  );
}
