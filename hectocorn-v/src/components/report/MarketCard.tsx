import { formatUsd } from "@/lib/utils";
import type { ReportPayload } from "@/types/report";

export function MarketCard({ report }: { report: ReportPayload }) {
  const est = report.aiResult?.market;
  const m = report.inputUsd.market;
  const tam = m.tamUsd ?? est?.tamUsd;
  const sam = m.samUsd ?? est?.samUsd;
  const som = m.somUsd ?? est?.somUsd;
  if (tam === undefined && sam === undefined && som === undefined) {
    return (
      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <h2 className="text-xl font-semibold tracking-[-0.5px]">Market size</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Not supplied and not estimated (AI unavailable). Add TAM/SAM/SOM on the form to enable the
          VC method for pre-revenue companies and the 3× SOM ceiling.
        </p>
      </section>
    );
  }
  const source =
    m.tamUsd !== undefined
      ? "supplied by the founder"
      : `estimated by AI (confidence ${est?.confidence ?? "?"}/100)`;
  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm">
      <h2 className="text-xl font-semibold tracking-[-0.5px]">Market size</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        {source}
        {est?.cagrPct !== undefined && m.marketCagrPct === undefined
          ? ` · CAGR ${est.cagrPct}%`
          : m.marketCagrPct !== undefined
            ? ` · CAGR ${m.marketCagrPct}%`
            : ""}
      </p>
      <dl className="grid grid-cols-3 gap-4">
        {[
          ["TAM", tam],
          ["SAM", sam],
          ["SOM", som],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-lg bg-secondary p-3">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="text-lg font-semibold">{typeof v === "number" ? formatUsd(v) : "—"}</dd>
          </div>
        ))}
      </dl>
      {est && m.tamUsd === undefined ? (
        <div className="mt-4 space-y-2 text-sm">
          <p className="text-muted-foreground">{est.method}</p>
          {est.sources.length ? (
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {est.sources.map((s, i) => (
                <li key={i}>
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-2 hover:underline"
                    >
                      {s.title || s.url}
                    </a>
                  ) : (
                    s.title
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
