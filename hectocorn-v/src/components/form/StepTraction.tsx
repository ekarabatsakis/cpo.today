"use client";

import { AlertTriangle } from "lucide-react";
import { useWatch } from "react-hook-form";

import { Grid, NumberField, SectionTitle, SwitchField, TagsField } from "./fields";
import type { WizardForm } from "./types";

export function StepTraction({ form }: { form: WizardForm }) {
  const { control } = form;
  const arr = useWatch({ control, name: "traction.arrUsd" });
  const burn = useWatch({ control, name: "financials.monthlyBurnUsd" });
  const cash = useWatch({ control, name: "financials.cashOnHandUsd" });
  const zeros = [
    arr === 0 && "ARR",
    burn === 0 && "monthly burn",
    cash === 0 && "cash on hand",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-8">
      {zeros.length ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-medium">{zeros.join(", ")}</span>{" "}
            {zeros.length === 1 ? "is" : "are"} zero. These numbers move the valuation materially:
            revenue drives the VC and multiples methods, and burn and cash set your runway. Fill
            them in if you have them.
          </p>
        </div>
      ) : null}

      <div className="space-y-4">
        <SectionTitle
          title="Traction"
          description="Customers and revenue. Five paying customers or $150k ARR moves you into the seed benchmarks."
        />
        <Grid cols={3}>
          <NumberField
            control={control}
            name="traction.payingCustomers"
            label="Paying customers"
            required
            min={0}
          />
          <NumberField
            control={control}
            name="traction.pilotsOrLOIs"
            label="Pilots or LOIs"
            min={0}
          />
          <NumberField
            control={control}
            name="traction.arrUsd"
            label="ARR"
            currency
            min={0}
            emphasiseZero
          />
        </Grid>
        <Grid cols={3}>
          <NumberField
            control={control}
            name="traction.nonRecurringRevenueTtmUsd"
            label="Non-recurring revenue (TTM)"
            currency
            min={0}
          />
          <NumberField
            control={control}
            name="traction.momGrowthPct"
            label="MoM revenue growth"
            suffix="%"
            optional
            step={0.1}
          />
          <NumberField
            control={control}
            name="traction.grossMarginPct"
            label="Gross margin"
            suffix="%"
            optional
            min={-100}
            max={100}
          />
        </Grid>
        <Grid cols={3}>
          <NumberField
            control={control}
            name="traction.churnAnnualPct"
            label="Annual churn"
            suffix="%"
            optional
            min={0}
            max={100}
          />
          <NumberField
            control={control}
            name="traction.netRevenueRetentionPct"
            label="Net revenue retention"
            suffix="%"
            optional
            min={0}
          />
          <NumberField
            control={control}
            name="traction.avgContractValueUsd"
            label="Avg. contract value"
            currency
            optional
            min={0}
          />
        </Grid>
        <Grid cols={3}>
          <NumberField
            control={control}
            name="traction.salesCycleDays"
            label="Sales cycle"
            suffix="days"
            optional
            min={0}
          />
          <NumberField
            control={control}
            name="traction.pipelineWeightedUsd"
            label="Weighted pipeline"
            currency
            min={0}
          />
        </Grid>
        <Grid>
          <TagsField
            control={control}
            name="traction.marqueeCustomers"
            label="Marquee customers"
            placeholder="Names of notable logos"
          />
          <TagsField
            control={control}
            name="traction.partnerships"
            label="Partnerships"
            placeholder="Named partners"
          />
        </Grid>
      </div>

      <div className="space-y-4">
        <SectionTitle
          title="Financials"
          description="Runway = cash ÷ burn. Under six months costs points; over eighteen earns them."
        />
        <Grid cols={3}>
          <NumberField
            control={control}
            name="financials.monthlyBurnUsd"
            label="Monthly burn"
            currency
            required
            min={0}
            emphasiseZero
          />
          <NumberField
            control={control}
            name="financials.cashOnHandUsd"
            label="Cash on hand"
            currency
            required
            min={0}
            emphasiseZero
          />
          <NumberField
            control={control}
            name="financials.revenueForecast12mUsd"
            label="Revenue forecast (12m)"
            currency
            optional
            min={0}
          />
        </Grid>
        <SwitchField
          control={control}
          name="financials.isProfitable"
          label="Profitable"
          description="Cash-flow positive today."
        />
      </div>
    </div>
  );
}
