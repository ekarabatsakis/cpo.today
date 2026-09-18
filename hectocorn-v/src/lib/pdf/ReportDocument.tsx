import { Document, Page, Path, Rect, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";

import { DISCLAIMER } from "@/components/layout/Footer";
import { describeFlag } from "@/components/report/flags";
import { SCORE_KEYS } from "@/lib/engine/types";
import { REGION_LABELS, SCORE_LABELS, SECTOR_LABELS, STAGE_LABELS } from "@/lib/schema/labels";
import { formatUsd } from "@/lib/utils";
import type { ReportPayload } from "@/types/report";

/** Brand colours from §1.3, as hex for the PDF renderer. */
const C = {
  foreground: "#020817",
  primary: "#0f172a",
  primaryForeground: "#f8fafc",
  muted: "#64748b",
  secondary: "#f1f5f9",
  border: "#e2e8f0",
  white: "#ffffff",
};

const s = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: C.foreground,
  },
  cover: {
    paddingTop: 96,
    paddingHorizontal: 56,
    paddingBottom: 56,
    fontFamily: "Helvetica",
    color: C.foreground,
    justifyContent: "space-between",
  },
  wordmark: { flexDirection: "row", alignItems: "center", gap: 8 },
  wordmarkText: { fontSize: 22, fontFamily: "Helvetica-Bold", letterSpacing: -0.5 },
  coverTitle: { fontSize: 36, fontFamily: "Helvetica-Bold", marginTop: 48, letterSpacing: -1 },
  coverSub: { fontSize: 14, color: C.muted, marginTop: 8, lineHeight: 1.4 },
  coverNumberLabel: { fontSize: 12, color: C.muted, marginTop: 40 },
  coverNumber: { fontSize: 54, fontFamily: "Helvetica-Bold", letterSpacing: -2, marginTop: 4 },
  coverMeta: { fontSize: 11, color: C.muted, marginTop: 6 },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 12, letterSpacing: -0.5 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
  p: { fontSize: 10, lineHeight: 1.5 },
  muted: { color: C.muted },
  small: { fontSize: 8.5, color: C.muted, lineHeight: 1.4 },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 5,
  },
  headRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: 5,
    color: C.muted,
  },
  cell: { flex: 1, paddingRight: 6 },
  cellR: { flex: 1, textAlign: "right" },
  pill: {
    backgroundColor: C.secondary,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 9,
  },
  pillDark: {
    backgroundColor: C.primary,
    color: C.primaryForeground,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    fontSize: 9,
  },
  trail: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  card: { borderWidth: 1, borderColor: C.border, borderRadius: 6, padding: 10, marginTop: 8 },
  bullet: { flexDirection: "row", gap: 6, marginBottom: 3 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: C.muted,
  },
  stat: { flex: 1, backgroundColor: C.secondary, borderRadius: 6, padding: 10 },
  statLabel: { fontSize: 8.5, color: C.muted },
  statValue: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 2 },
});

function Mark({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Rect width="32" height="32" rx="8" fill={C.primary} />
      <Path
        d="M8 8 L16 25 L24 8"
        stroke={C.white}
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

function Wordmark() {
  return (
    <View style={s.wordmark}>
      <Text style={s.wordmarkText}>Hectocorn</Text>
      <Mark size={26} />
    </View>
  );
}

function Footer({ report }: { report: ReportPayload }) {
  return (
    <View style={s.footer} fixed>
      <Text>
        Hectocorn V · report {report.id} · benchmarks {report.benchmarksVersion ?? "—"}
      </Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export function ReportDocument({ report }: { report: ReportPayload }) {
  const engine = report.effectiveEngine;
  const input = report.inputUsd;
  const final = report.finalPreMoneyUsd ?? engine?.preMoneyUsd ?? 0;
  const memo = report.aiResult?.memo;
  const adj = report.adjustmentPct ?? 0;
  const date = new Date(report.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const lowUsd = engine ? Math.round(final * (engine.lowUsd / engine.preMoneyUsd)) : 0;
  const highUsd = engine ? Math.round(final * (engine.highUsd / engine.preMoneyUsd)) : 0;

  return (
    <Document
      title={`${report.name} — Hectocorn V valuation`}
      author="Hectocorn V"
      subject="Indicative startup valuation"
    >
      <Page size="A4" style={s.cover}>
        <View>
          <Wordmark />
          <Text style={s.coverTitle}>{report.name}</Text>
          <Text style={s.coverSub}>{input.oneLiner}</Text>
          <Text style={s.coverNumberLabel}>Indicative pre-money valuation</Text>
          <Text style={s.coverNumber}>{formatUsd(final)}</Text>
          <Text style={s.coverMeta}>
            {engine
              ? `${STAGE_LABELS[engine.stage]} · range ${formatUsd(lowUsd)} – ${formatUsd(highUsd)} · confidence ${engine.confidence}/100`
              : ""}
          </Text>
          <Text style={s.coverMeta}>{date}</Text>
        </View>
        <Text style={s.small}>{DISCLAIMER}</Text>
      </Page>

      {engine ? (
        <Page size="A4" style={s.page}>
          <Text style={s.h1}>Summary</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={s.stat}>
              <Text style={s.statLabel}>Final pre-money</Text>
              <Text style={s.statValue}>{formatUsd(final)}</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statLabel}>Engine pre-money</Text>
              <Text style={s.statValue}>{formatUsd(engine.preMoneyUsd)}</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statLabel}>AI adjustment</Text>
              <Text style={s.statValue}>{memo ? `${adj > 0 ? "+" : ""}${adj}%` : "none"}</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statLabel}>Range</Text>
              <Text style={s.statValue}>{`${formatUsd(lowUsd)} – ${formatUsd(highUsd)}`}</Text>
            </View>
          </View>
          <View style={s.trail}>
            <Text
              style={s.pill}
            >{`Stage ${STAGE_LABELS[engine.stage]}: ${engine.stageReason}`}</Text>
          </View>
          {report.inputUsd.funding.currentlyRaising && report.inputUsd.funding.targetRaiseUsd ? (
            <Text style={[s.p, { marginTop: 8 }]}>
              Implied post-money after the {formatUsd(report.inputUsd.funding.targetRaiseUsd)}{" "}
              raise: {formatUsd(final + report.inputUsd.funding.targetRaiseUsd)}.
            </Text>
          ) : null}

          <Text style={s.h2}>Company</Text>
          <Text style={s.p}>
            {SECTOR_LABELS[input.sector]}
            {input.subSector ? ` · ${input.subSector}` : ""} · {input.hqCountry} (
            {REGION_LABELS[input.hqRegion]}) · founded {input.foundedDate} ·{" "}
            {input.team.fullTimeEmployees} FTE · {input.traction.payingCustomers} paying customers ·
            ARR {formatUsd(input.traction.arrUsd)} · raised{" "}
            {formatUsd(input.funding.totalRaisedUsd)}
          </Text>

          <Text style={s.h2}>Qualitative scores</Text>
          <View style={s.headRow}>
            <Text style={s.cell}>Score</Text>
            <Text style={s.cellR}>Formula</Text>
            {report.aiResult?.scores ? <Text style={s.cellR}>AI (used)</Text> : null}
          </View>
          {SCORE_KEYS.map((k) => (
            <View key={k} style={s.row}>
              <Text style={s.cell}>{SCORE_LABELS[k]}</Text>
              <Text style={s.cellR}>{engine.deterministicScores[k]}</Text>
              {report.aiResult?.scores ? (
                <Text style={s.cellR}>{report.aiResult.scores.scores[k]}</Text>
              ) : null}
            </View>
          ))}

          <Text style={s.h2}>Methods</Text>
          <View style={s.headRow}>
            <Text style={[s.cell, { flex: 2 }]}>Method</Text>
            <Text style={s.cellR}>Pre-money</Text>
            <Text style={s.cellR}>Weight</Text>
          </View>
          {engine.methods.map((m) => (
            <View key={m.key} style={s.row}>
              <Text style={[s.cell, { flex: 2 }]}>{m.name}</Text>
              <Text style={s.cellR}>
                {m.applicable && m.valuationUsd > 0 ? formatUsd(m.valuationUsd) : "n/a"}
              </Text>
              <Text style={s.cellR}>
                {engine.weights[m.key] !== undefined
                  ? `${Math.round(engine.weights[m.key] * 100)}%`
                  : "0%"}
              </Text>
            </View>
          ))}
          <Text style={[s.small, { marginTop: 6 }]}>
            Blend: weighted geometric mean {formatUsd(engine.blendedUsd)}
            {engine.marketCeilingUsd && engine.flags.includes("market_ceiling_applied")
              ? `, capped at the market ceiling ${formatUsd(engine.marketCeilingUsd)}`
              : ""}
            . Confidence = 100 − dispersion across methods.
          </Text>

          {engine.flags.length ? (
            <>
              <Text style={s.h2}>Flags</Text>
              {engine.flags.map((f) => (
                <View key={f} style={s.bullet}>
                  <Text style={s.small}>•</Text>
                  <Text style={s.small}>{describeFlag(f)}</Text>
                </View>
              ))}
            </>
          ) : null}
          <Footer report={report} />
        </Page>
      ) : null}

      {engine ? (
        <Page size="A4" style={s.page}>
          <Text style={s.h1}>Method notes</Text>
          {engine.methods.map((m) => (
            <View key={m.key} style={s.card} wrap={false}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11 }}>
                {m.name} —{" "}
                {m.applicable && m.valuationUsd > 0 ? formatUsd(m.valuationUsd) : "not applicable"}
              </Text>
              {m.notes.slice(0, 6).map((n, i) => (
                <Text key={i} style={[s.small, { marginTop: 3 }]}>
                  {n}
                </Text>
              ))}
            </View>
          ))}
          <Footer report={report} />
        </Page>
      ) : null}

      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{memo ? "AI investment memo" : "AI memo"}</Text>
        {memo ? (
          <>
            <Text style={s.small}>
              Written by {report.aiResult?.model} · memo confidence {memo.memo.confidence}/100 ·
              adjustment {memo.adjustment.appliedPct > 0 ? "+" : ""}
              {memo.adjustment.appliedPct}%{memo.adjustment.clamped ? " (clamped to ±25%)" : ""}
            </Text>
            <View style={s.card}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>Why the adjustment</Text>
              <Text style={[s.p, { marginTop: 3 }]}>{memo.adjustment.rationale}</Text>
            </View>
            <Text style={s.h2}>Summary</Text>
            <Text style={s.p}>{memo.memo.summary}</Text>
            <Text style={s.h2}>Strengths</Text>
            {memo.memo.strengths.map((t, i) => (
              <View key={i} style={s.bullet}>
                <Text style={s.p}>•</Text>
                <Text style={[s.p, { flex: 1 }]}>{t}</Text>
              </View>
            ))}
            <Text style={s.h2}>Risks</Text>
            {memo.memo.risks.map((t, i) => (
              <View key={i} style={s.bullet}>
                <Text style={s.p}>•</Text>
                <Text style={[s.p, { flex: 1 }]}>{t}</Text>
              </View>
            ))}
            {memo.memo.comparables.length ? (
              <>
                <Text style={s.h2}>Comparables</Text>
                {memo.memo.comparables.map((c, i) => (
                  <Text key={i} style={[s.p, { marginBottom: 2 }]}>
                    <Text style={{ fontFamily: "Helvetica-Bold" }}>{c.name}</Text>
                    {c.indicativeValuation ? ` (${c.indicativeValuation})` : ""}: {c.whyRelevant}
                  </Text>
                ))}
              </>
            ) : null}
            {memo.memo.whatMovesTheNumber.length ? (
              <>
                <Text style={s.h2}>What moves the number</Text>
                {memo.memo.whatMovesTheNumber.map((w, i) => (
                  <View key={i} style={s.row}>
                    <Text style={[s.cell, { flex: 4 }]}>{w.lever}</Text>
                    <Text style={s.cellR}>
                      {w.estimatedImpactPct > 0 ? "+" : ""}
                      {w.estimatedImpactPct}%
                    </Text>
                  </View>
                ))}
              </>
            ) : null}
            {memo.memo.recommendedRaise ? (
              <>
                <Text style={s.h2}>Recommended raise</Text>
                <Text style={s.p}>
                  {formatUsd(memo.memo.recommendedRaise.amountUsd)}.{" "}
                  {memo.memo.recommendedRaise.rationale}
                </Text>
              </>
            ) : null}
            <Text style={[s.small, { marginTop: 12 }]}>{memo.disclaimer}</Text>
          </>
        ) : (
          <Text style={s.p}>
            The AI memo was not available for this report (no API key or the AI stage failed), so it
            contains the deterministic engine result only.
          </Text>
        )}
        <Text style={s.h2}>Disclaimer</Text>
        <Text style={s.small}>{DISCLAIMER}</Text>
        <Text style={[s.small, { marginTop: 8 }]}>
          Benchmarks {report.benchmarksVersion ?? "—"} · scores used: {engine?.scoresSource ?? "—"}{" "}
          · model {report.model ?? "none"} · prompt {report.promptVersion ?? "—"} · computed{" "}
          {engine ? engine.asOf.slice(0, 10) : "—"}
        </Text>
        <Footer report={report} />
      </Page>
    </Document>
  );
}
