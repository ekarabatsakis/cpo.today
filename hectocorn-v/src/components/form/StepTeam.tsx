"use client";

import {
  BUSINESS_MODEL_LABELS,
  REGION_LABELS,
  SECTOR_LABELS,
  toOptions,
} from "@/lib/schema/labels";
import {
  Grid,
  NumberField,
  SectionTitle,
  SelectField,
  SwitchField,
  TagsField,
  TextField,
} from "./fields";
import type { WizardForm } from "./types";

export function StepTeam({ form }: { form: WizardForm }) {
  const { control } = form;
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <SectionTitle
          title="Company"
          description="Who you are, what you do and where. Sector and region set the benchmarks every method starts from."
        />
        <Grid>
          <TextField
            control={control}
            name="name"
            label="Company name"
            required
            placeholder="PlugSecure"
          />
          <TextField
            control={control}
            name="website"
            label="Website"
            type="url"
            optional
            placeholder="https://"
          />
        </Grid>
        <TextField
          control={control}
          name="oneLiner"
          label="One-liner"
          required
          maxLength={300}
          placeholder="What you do, for whom, in one sentence"
        />
        <Grid cols={3}>
          <SelectField
            control={control}
            name="sector"
            label="Sector"
            required
            options={toOptions(SECTOR_LABELS)}
          />
          <TextField
            control={control}
            name="subSector"
            label="Sub-sector"
            optional
            placeholder="e.g. OT/ICS security"
          />
          <SelectField
            control={control}
            name="businessModel"
            label="Business model"
            required
            options={toOptions(BUSINESS_MODEL_LABELS)}
          />
        </Grid>
        <Grid cols={3}>
          <TextField control={control} name="foundedDate" label="Founded" type="date" required />
          <SelectField
            control={control}
            name="hqRegion"
            label="HQ region"
            required
            options={toOptions(REGION_LABELS)}
          />
          <TextField
            control={control}
            name="hqCountry"
            label="HQ country (ISO-2)"
            required
            placeholder="GR"
            maxLength={2}
          />
        </Grid>
        <Grid>
          <TagsField
            control={control}
            name="otherBranches"
            label="Other branches"
            placeholder="DE, UK"
            upper
          />
          <TagsField
            control={control}
            name="operatingCountries"
            label="Operating countries"
            placeholder="GR, UK, RO"
            upper
          />
        </Grid>
      </div>

      <div className="space-y-4">
        <SectionTitle
          title="Team"
          description="Team carries 30% of the Scorecard and drives the management and reputation risk factors."
        />
        <Grid cols={3}>
          <NumberField
            control={control}
            name="team.fullTimeEmployees"
            label="Full-time employees"
            required
            min={1}
          />
          <NumberField control={control} name="team.founders" label="Founders" required min={1} />
          <NumberField
            control={control}
            name="team.foundersWithPriorExit"
            label="Founders with a prior exit"
            required
            min={0}
          />
        </Grid>
        <Grid cols={3}>
          <NumberField
            control={control}
            name="team.foundersWithDomainYears"
            label="Avg. domain experience"
            suffix="yrs"
            required
            min={0}
            step={0.5}
          />
          <NumberField
            control={control}
            name="team.keyHiresPlanned12m"
            label="Key hires planned (12m)"
            min={0}
          />
          <NumberField
            control={control}
            name="team.advisorsNotable"
            label="Notable advisors"
            min={0}
          />
        </Grid>
        <SwitchField
          control={control}
          name="team.technicalCofounder"
          label="Technical co-founder"
          description="At least one founder owns the technology."
        />
      </div>
    </div>
  );
}
