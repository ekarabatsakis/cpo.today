"use client";

import { LEVEL_LABELS, PRODUCT_STAGE_LABELS, toOptions } from "@/lib/schema/labels";
import { Grid, NumberField, SectionTitle, SelectField, SwitchField, TagsField } from "./fields";
import type { WizardForm } from "./types";

export function StepIP({ form }: { form: WizardForm }) {
  const { control } = form;
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <SectionTitle
          title="Product"
          description="Product stage sets the product score and the stage-of-business risk factor. An MVP is the entry ticket to pre-seed benchmarks."
        />
        <Grid>
          <SelectField
            control={control}
            name="ip.productStage"
            label="Product stage"
            required
            options={toOptions(PRODUCT_STAGE_LABELS)}
          />
          <SelectField
            control={control}
            name="ip.techDefensibility"
            label="Tech defensibility"
            required
            options={toOptions(LEVEL_LABELS)}
          />
        </Grid>
        <TagsField
          control={control}
          name="ip.certifications"
          label="Certifications"
          placeholder="ISO 27001, IEC 62443, SOC2, CE"
        />
      </div>

      <div className="space-y-4">
        <SectionTitle
          title="Intellectual property"
          description="Patents, data and trademarks feed the moat score and the technology risk factor."
        />
        <Grid>
          <NumberField control={control} name="ip.patentsGranted" label="Patents granted" min={0} />
          <NumberField control={control} name="ip.patentsPending" label="Patents pending" min={0} />
        </Grid>
        <div className="grid gap-4 sm:grid-cols-2">
          <SwitchField
            control={control}
            name="ip.trademarksRegistered"
            label="Trademarks registered"
          />
          <SwitchField control={control} name="ip.proprietaryData" label="Proprietary data" />
          <SwitchField control={control} name="ip.regulatoryTailwind" label="Regulatory tailwind" />
        </div>
      </div>
    </div>
  );
}
