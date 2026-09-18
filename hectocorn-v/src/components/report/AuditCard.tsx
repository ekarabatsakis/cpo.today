import { DISCLAIMER } from "@/components/layout/Footer";
import { describeFlag } from "./flags";
import type { ReportPayload } from "@/types/report";

export function AuditCard({ report }: { report: ReportPayload }) {
  const engine = report.effectiveEngine;
  const t = report.timings;
  return (
    <section
      className="rounded-lg border bg-card p-6 text-sm shadow-sm"
      aria-labelledby="audit-title"
    >
      <h2 id="audit-title" className="text-xl font-semibold tracking-[-0.5px]">
        Audit trail
      </h2>
      {engine?.flags.length ? (
        <ul className="mt-3 space-y-1.5">
          {engine.flags.map((f) => (
            <li key={f} className="flex gap-2">
              <code className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-xs">{f}</code>
              <span className="text-muted-foreground">{describeFlag(f)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-muted-foreground">No flags raised.</p>
      )}
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-muted-foreground sm:grid-cols-2">
        <div className="flex justify-between gap-4">
          <dt>Benchmarks</dt>
          <dd className="text-foreground">
            {report.benchmarksVersion ?? engine?.benchmarksVersion}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Scores used</dt>
          <dd className="text-foreground">{engine?.scoresSource}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Model</dt>
          <dd className="text-foreground">{report.model ?? "none (offline)"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Prompt version</dt>
          <dd className="text-foreground">{report.promptVersion ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>AI status</dt>
          <dd className="text-foreground">{report.aiStatus}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Computed</dt>
          <dd className="text-foreground">
            {engine ? new Date(engine.asOf).toISOString().slice(0, 10) : "—"}
          </dd>
        </div>
        {t ? (
          <div className="flex justify-between gap-4 sm:col-span-2">
            <dt>Timings</dt>
            <dd className="text-foreground">
              engine {t.engineMs ?? 0} ms
              {t.scoreMs ? ` · scoring ${t.scoreMs} ms` : ""}
              {t.marketMs ? ` · market ${t.marketMs} ms` : ""}
              {t.memoMs ? ` · memo ${t.memoMs} ms` : ""}
              {t.totalMs ? ` · total ${t.totalMs} ms` : ""}
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-4 text-xs text-muted-foreground">{DISCLAIMER}</p>
    </section>
  );
}
