"use client";

import { Plus, Trash2 } from "lucide-react";
import { useFieldArray, useWatch } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { LEAD_INVESTOR_LABELS, ROUND_TYPE_LABELS, toOptions } from "@/lib/schema/labels";
import { Grid, NumberField, SectionTitle, SelectField, SwitchField, TextField } from "./fields";
import type { WizardForm } from "./types";

export function StepFunding({ form }: { form: WizardForm }) {
  const { control } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "funding.rounds" });
  const raising = useWatch({ control, name: "funding.currentlyRaising" });

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <SectionTitle
          title="Funding rounds"
          description="A priced round becomes the Last-Round Anchor. A VC lead adds to the deal score."
        />
        {fields.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No rounds yet. Add one if you have raised money, priced or not.
          </p>
        ) : null}
        <div className="space-y-4">
          {fields.map((f, i) => (
            <div key={f.id} className="space-y-4 rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Round {i + 1}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(i)}
                  aria-label={`Remove round ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              </div>
              <Grid cols={3}>
                <SelectField
                  control={control}
                  name={`funding.rounds.${i}.type`}
                  label="Type"
                  required
                  options={toOptions(ROUND_TYPE_LABELS)}
                />
                <TextField
                  control={control}
                  name={`funding.rounds.${i}.date`}
                  label="Date"
                  type="date"
                  required
                />
                <NumberField
                  control={control}
                  name={`funding.rounds.${i}.amountUsd`}
                  label="Amount raised"
                  currency
                  required
                  min={0}
                />
              </Grid>
              <Grid>
                <NumberField
                  control={control}
                  name={`funding.rounds.${i}.postMoneyUsd`}
                  label="Post-money valuation"
                  currency
                  optional
                  min={0}
                  hint="Leave empty for unpriced rounds (SAFE, convertible, grant)."
                />
                <SelectField
                  control={control}
                  name={`funding.rounds.${i}.leadInvestorType`}
                  label="Lead investor"
                  optional
                  options={toOptions(LEAD_INVESTOR_LABELS)}
                />
              </Grid>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            append({
              type: "pre_seed",
              date: new Date().toISOString().slice(0, 10),
              amountUsd: 0,
            })
          }
        >
          <Plus className="h-4 w-4" /> Add a round
        </Button>
      </div>

      <div className="space-y-4">
        <SectionTitle title="Totals and the current raise" />
        <Grid>
          <NumberField
            control={control}
            name="funding.totalRaisedUsd"
            label="Total raised to date"
            currency
            min={0}
          />
          <NumberField
            control={control}
            name="funding.grantsNonDilutiveUsd"
            label="Non-dilutive grants"
            currency
            min={0}
          />
        </Grid>
        <SwitchField
          control={control}
          name="funding.currentlyRaising"
          label="Currently raising"
          description="The target raise is subtracted in the VC method and added to the implied post-money."
        />
        {raising ? (
          <Grid>
            <NumberField
              control={control}
              name="funding.targetRaiseUsd"
              label="Target raise"
              currency
              optional
              min={0}
            />
          </Grid>
        ) : null}
      </div>
    </div>
  );
}
