"use client";

import { LEVEL_LABELS, STAGE_LABELS, toOptions } from "@/lib/schema/labels";
import {
  Grid,
  NumberField,
  SectionTitle,
  SelectField,
  SwitchField,
  TagsField,
  TextareaField,
} from "./fields";
import type { WizardForm } from "./types";

export function StepMarket({ form }: { form: WizardForm }) {
  const { control } = form;
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <SectionTitle
          title="Market"
          description="Leave TAM/SAM/SOM empty and Claude estimates them (bottom-up SOM, cited sources when web search is on). SOM × 3 caps the valuation."
        />
        <Grid cols={3}>
          <NumberField
            control={control}
            name="market.tamUsd"
            label="TAM"
            currency
            optional
            min={0}
            hint="Total addressable market, annual."
          />
          <NumberField
            control={control}
            name="market.samUsd"
            label="SAM"
            currency
            optional
            min={0}
            hint="Serviceable addressable market."
          />
          <NumberField
            control={control}
            name="market.somUsd"
            label="SOM"
            currency
            optional
            min={0}
            hint="Serviceable obtainable market: customers × ACV reachable in 5 years."
          />
        </Grid>
        <Grid>
          <NumberField
            control={control}
            name="market.marketCagrPct"
            label="Market CAGR"
            suffix="%"
            optional
            step={0.1}
          />
          <SelectField
            control={control}
            name="market.competitiveIntensity"
            label="Competitive intensity"
            optional
            options={toOptions(LEVEL_LABELS)}
          />
        </Grid>
        <TagsField
          control={control}
          name="market.competitorsNamed"
          label="Named competitors"
          placeholder="Company A, Company B"
        />
      </div>

      <div className="space-y-4">
        <SectionTitle
          title="Risk flags"
          description="Each flag is explicit in the Risk-Factor Summation notes."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SwitchField
            control={control}
            name="risks.keyPersonDependency"
            label="Key-person dependency"
            description="The company would stall if one person left."
          />
          <SwitchField
            control={control}
            name="risks.litigationOrRegulatoryRisk"
            label="Litigation or regulatory risk"
            description="Pending litigation or an adverse regulatory exposure."
          />
          <SwitchField
            control={control}
            name="risks.hardwareSupplyRisk"
            label="Hardware supply risk"
            description="Dependence on constrained components or manufacturers."
          />
        </div>
        <Grid>
          <NumberField
            control={control}
            name="risks.singleCustomerConcentrationPct"
            label="Largest customer share of revenue"
            suffix="%"
            optional
            min={0}
            max={100}
          />
          <SelectField
            control={control}
            name="selfDeclaredStage"
            label="Self-declared stage"
            optional
            options={toOptions(STAGE_LABELS)}
            hint="Used only as a tiebreaker; the stage is inferred from the data."
          />
        </Grid>
      </div>

      <div className="space-y-4">
        <SectionTitle
          title="Narrative"
          description="The AI scorer reads this. Vision, moat, why now, named customers and partners."
        />
        <TextareaField
          control={control}
          name="narrative"
          label="Anything else"
          optional
          rows={6}
          maxLength={3000}
        />
      </div>
    </div>
  );
}
