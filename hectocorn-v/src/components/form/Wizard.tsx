"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, RotateCcw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PLUGSECURE_EXAMPLE } from "@/lib/schema/examples";
import { StartupInput } from "@/lib/schema/startup";
import { StepFunding } from "./StepFunding";
import { StepIP } from "./StepIP";
import { StepIndicator, type StepMeta } from "./StepIndicator";
import { StepMarket } from "./StepMarket";
import { StepReview, type RunState } from "./StepReview";
import { StepTeam } from "./StepTeam";
import { StepTraction } from "./StepTraction";
import {
  DRAFT_KEY,
  DRAFT_STEP_KEY,
  type FieldName,
  type FormOutput,
  type FormValues,
} from "./types";

const STEPS: StepMeta[] = [
  { key: "team", title: "Company & team", short: "Team" },
  { key: "traction", title: "Traction & financials", short: "Traction" },
  { key: "funding", title: "Funding", short: "Funding" },
  { key: "ip", title: "IP & product", short: "IP" },
  { key: "market", title: "Market & risks", short: "Market" },
  { key: "review", title: "Review", short: "Review" },
];

const STEP_FIELDS: FieldName[][] = [
  [
    "name",
    "website",
    "oneLiner",
    "sector",
    "subSector",
    "businessModel",
    "foundedDate",
    "hqRegion",
    "hqCountry",
    "otherBranches",
    "operatingCountries",
    "team",
  ],
  ["traction", "financials"],
  ["funding"],
  ["ip"],
  ["market", "risks", "narrative", "selfDeclaredStage"],
  [],
];

const EMPTY: FormValues = {
  name: "",
  oneLiner: "",
  sector: "saas",
  businessModel: "b2b_saas",
  foundedDate: "",
  hqRegion: "EU",
  hqCountry: "",
  otherBranches: [],
  operatingCountries: [],
  team: {
    fullTimeEmployees: 1,
    founders: 1,
    foundersWithPriorExit: 0,
    foundersWithDomainYears: 0,
    technicalCofounder: false,
    keyHiresPlanned12m: 0,
    advisorsNotable: 0,
  },
  traction: {
    payingCustomers: 0,
    pilotsOrLOIs: 0,
    arrUsd: 0,
    nonRecurringRevenueTtmUsd: 0,
    pipelineWeightedUsd: 0,
    marqueeCustomers: [],
    partnerships: [],
  },
  financials: { monthlyBurnUsd: 0, cashOnHandUsd: 0, isProfitable: false },
  funding: { rounds: [], totalRaisedUsd: 0, currentlyRaising: false, grantsNonDilutiveUsd: 0 },
  ip: {
    patentsGranted: 0,
    patentsPending: 0,
    trademarksRegistered: false,
    proprietaryData: false,
    certifications: [],
    regulatoryTailwind: false,
    productStage: "mvp",
    techDefensibility: "medium",
  },
  market: { competitorsNamed: [], hasEstimateFromAi: false },
  risks: {
    keyPersonDependency: false,
    litigationOrRegulatoryRisk: false,
    hardwareSupplyRisk: false,
  },
  reportingCurrency: "USD",
};

const PROGRESS_BY_STATUS: Record<string, number> = {
  pending: 10,
  engine: 25,
  scoring: 45,
  market: 60,
  memo: 80,
  done: 100,
  error: 100,
};

export function Wizard() {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [run, setRun] = useState<RunState>({ phase: "idle" });
  const pollRef = useRef<number | null>(null);

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(StartupInput),
    defaultValues: EMPTY,
    mode: "onBlur",
  });
  const { reset, watch, trigger, getValues, setValue } = form;

  // Restore the autosaved draft once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) reset({ ...EMPTY, ...(JSON.parse(raw) as FormValues) });
      const s = Number(localStorage.getItem(DRAFT_STEP_KEY) ?? 0);
      if (Number.isFinite(s) && s >= 0 && s < STEPS.length) {
        setStep(s);
        setFurthest(s);
      }
    } catch {
      // ignore a corrupt draft
    }
    setHydrated(true);
  }, [reset]);

  // Autosave (debounced).
  useEffect(() => {
    if (!hydrated) return;
    let timer: number | undefined;
    const sub = watch((values) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        try {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
        } catch {
          // storage may be unavailable
        }
      }, 400);
    });
    return () => {
      sub.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [watch, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(DRAFT_STEP_KEY, String(step));
    } catch {
      // ignore
    }
  }, [step, hydrated]);

  const goTo = useCallback((i: number) => {
    setStep(i);
    setFurthest((f) => Math.max(f, i));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const next = async () => {
    const ok = await trigger(STEP_FIELDS[step], { shouldFocus: true });
    if (!ok) {
      toast({
        title: "Some fields need attention",
        description: "Fix the highlighted fields to continue.",
      });
      return;
    }
    goTo(Math.min(step + 1, STEPS.length - 1));
  };

  const loadExample = () => {
    reset({ ...EMPTY, ...PLUGSECURE_EXAMPLE });
    setFurthest(STEPS.length - 1);
    toast({
      title: "PlugSecure loaded",
      description: "The example is filled in. Review each step or jump to Review.",
    });
  };

  const clearDraft = () => {
    reset(EMPTY);
    try {
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(DRAFT_STEP_KEY);
    } catch {
      // ignore
    }
    setStep(0);
    setFurthest(0);
  };

  const stopPolling = useCallback(() => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  const runValuation = async () => {
    const ok = await trigger(undefined, { shouldFocus: true });
    if (!ok) {
      const firstBad = STEP_FIELDS.findIndex((fields) =>
        fields.some((f) => {
          const err = form.getFieldState(f).error;
          return (
            Boolean(err) || Boolean(form.formState.errors[f.split(".")[0] as keyof FormValues])
          );
        }),
      );
      setRun({
        phase: "error",
        error: "Some inputs are invalid. Go back to the highlighted step.",
      });
      if (firstBad >= 0) goTo(firstBad);
      return;
    }
    setRun({ phase: "submitting", message: "Validating and running the engine…", progress: 5 });
    try {
      const res = await fetch("/api/valuate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(getValues()),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const { id } = (await res.json()) as { id: string };
      setRun({ phase: "processing", message: "Engine done. Scoring team…", progress: 30 });
      const poll = async () => {
        try {
          const r = await fetch(`/api/report/${id}/status`, { cache: "no-store" });
          if (!r.ok) return;
          const s = (await r.json()) as { status: string; statusMessage?: string };
          setRun({
            phase: "processing",
            message: s.statusMessage ?? "Working…",
            progress: PROGRESS_BY_STATUS[s.status] ?? 50,
          });
          if (s.status === "done" || s.status === "error") {
            stopPolling();
            try {
              localStorage.removeItem(DRAFT_STEP_KEY);
            } catch {
              // ignore
            }
            router.push(`/report/${id}`);
          }
        } catch {
          // transient network error; keep polling
        }
      };
      await poll();
      pollRef.current = window.setInterval(poll, 1500);
    } catch (e) {
      setRun({ phase: "error", error: e instanceof Error ? e.message : "Something went wrong." });
    }
  };

  const currency = watch("reportingCurrency") ?? "USD";
  const StepComponent = useMemo(
    () => [StepTeam, StepTraction, StepFunding, StepIP, StepMarket][step],
    [step],
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <StepIndicator steps={STEPS} current={step} furthest={furthest} onSelect={goTo} />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="currency" className="text-muted-foreground">
              Currency
            </Label>
            <Select
              value={currency}
              onValueChange={(v) =>
                setValue("reportingCurrency", v as FormValues["reportingCurrency"])
              }
            >
              <SelectTrigger id="currency" className="h-9 w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadExample}
            data-testid="load-example"
          >
            <Sparkles className="h-4 w-4" /> Load PlugSecure example
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearDraft}
            aria-label="Clear the form"
          >
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step < STEPS.length - 1) void next();
        }}
        noValidate
        className="rounded-lg border bg-card p-6 shadow-sm md:p-8"
      >
        {step === STEPS.length - 1 ? (
          <StepReview form={form} run={run} onRun={() => void runValuation()} />
        ) : (
          <StepComponent form={form} />
        )}

        {step < STEPS.length - 1 ? (
          <div className="mt-8 flex items-center justify-between border-t pt-6">
            <Button
              type="button"
              variant="ghost"
              disabled={step === 0}
              onClick={() => goTo(step - 1)}
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button type="submit" data-testid="next-step">
              {step === STEPS.length - 2 ? "Review" : "Next"} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="mt-8 flex items-center justify-between border-t pt-6">
            <Button type="button" variant="ghost" onClick={() => goTo(step - 1)}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          </div>
        )}
      </form>
      <p className="text-center text-xs text-muted-foreground">
        Drafts autosave to this browser. Nothing is sent until you run the valuation.
      </p>
    </div>
  );
}
