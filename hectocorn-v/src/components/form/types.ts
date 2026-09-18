import type { Control, FieldPath, UseFormReturn } from "react-hook-form";
import type { StartupInput, StartupInputRaw } from "@/lib/schema/startup";

export type FormValues = StartupInputRaw;
export type FormOutput = StartupInput;
export type FormControl = Control<FormValues>;
export type FieldName = FieldPath<FormValues>;
export type WizardForm = UseFormReturn<FormValues, unknown, FormOutput>;

export const DRAFT_KEY = "hectocorn-v:draft";
export const DRAFT_STEP_KEY = "hectocorn-v:draft-step";
