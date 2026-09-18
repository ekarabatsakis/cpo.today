"use client";

import { Info } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Controller, useWatch } from "react-hook-form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { schemaDescriptions } from "@/lib/schema/startup";
import { CURRENCY_SYMBOL } from "@/lib/schema/labels";
import { cn } from "@/lib/utils";
import type { FieldName, FormControl } from "./types";

const DESCRIPTIONS = schemaDescriptions();

/** Field label with an optional tooltip drawn from the zod `.describe()` text. */
export function FieldShell({
  id,
  label,
  hint,
  name,
  error,
  required,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  name?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const tooltip = hint ?? (name ? DESCRIPTIONS[name] : undefined);
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id}>
          {label}
          {required ? <span className="text-muted-foreground"> *</span> : null}
        </Label>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label={`About ${label}`}
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {children}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface BaseFieldProps {
  control: FormControl;
  name: FieldName;
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
}

export function TextField({
  control,
  name,
  label,
  hint,
  required,
  className,
  placeholder,
  type = "text",
  optional,
  maxLength,
}: BaseFieldProps & {
  placeholder?: string;
  type?: "text" | "url" | "date";
  /** Empty string is stored as undefined so optional zod fields validate. */
  optional?: boolean;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell
          id={id}
          label={label}
          hint={hint}
          name={name}
          error={fieldState.error?.message}
          required={required}
          className={className}
        >
          <Input
            id={id}
            type={type}
            placeholder={placeholder}
            maxLength={maxLength}
            value={typeof field.value === "string" ? field.value : ""}
            onChange={(e) => {
              const v = e.target.value;
              field.onChange(optional && v === "" ? undefined : v);
            }}
            onBlur={field.onBlur}
            ref={field.ref}
            aria-invalid={fieldState.invalid || undefined}
          />
        </FieldShell>
      )}
    />
  );
}

export function NumberField({
  control,
  name,
  label,
  hint,
  required,
  className,
  placeholder,
  currency,
  suffix,
  step = 1,
  min,
  max,
  optional,
  emphasiseZero,
}: BaseFieldProps & {
  placeholder?: string;
  /** Show the reporting currency as a prefix; the API converts to USD. */
  currency?: boolean;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
  /** Empty input is stored as undefined (for optional zod numbers). */
  optional?: boolean;
  /** Highlight when the value is 0, for placeholder-sensitive fields. */
  emphasiseZero?: boolean;
}) {
  const id = useId();
  const reportingCurrency = useWatch({ control, name: "reportingCurrency" }) ?? "USD";
  const prefix = currency ? CURRENCY_SYMBOL[reportingCurrency] : undefined;
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const value = typeof field.value === "number" ? field.value : undefined;
        const isZero = emphasiseZero && value === 0;
        return (
          <FieldShell
            id={id}
            label={label}
            hint={hint}
            name={name}
            error={fieldState.error?.message}
            required={required}
            className={className}
          >
            <div className="relative">
              {prefix ? (
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                  {prefix}
                </span>
              ) : null}
              <Input
                id={id}
                type="number"
                inputMode="decimal"
                step={step}
                min={min}
                max={max}
                placeholder={placeholder}
                className={cn(prefix && "pl-7", suffix && "pr-12", isZero && "border-amber-500")}
                value={value === undefined ? "" : value}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    field.onChange(optional ? undefined : 0);
                    return;
                  }
                  const n = Number(raw);
                  field.onChange(Number.isNaN(n) ? undefined : n);
                }}
                onBlur={field.onBlur}
                ref={field.ref}
                aria-invalid={fieldState.invalid || undefined}
              />
              {suffix ? (
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
                  {suffix}
                </span>
              ) : null}
            </div>
            {isZero ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Zero is treated as a real value. If you have this number, it changes the result.
              </p>
            ) : null}
          </FieldShell>
        );
      }}
    />
  );
}

export function SelectField({
  control,
  name,
  label,
  hint,
  required,
  className,
  options,
  placeholder = "Select…",
  optional,
}: BaseFieldProps & {
  options: { value: string; label: string }[];
  placeholder?: string;
  optional?: boolean;
}) {
  const id = useId();
  const NONE = "__none__";
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FieldShell
          id={id}
          label={label}
          hint={hint}
          name={name}
          error={fieldState.error?.message}
          required={required}
          className={className}
        >
          <Select
            value={typeof field.value === "string" ? field.value : optional ? NONE : ""}
            onValueChange={(v) => field.onChange(v === NONE ? undefined : v)}
          >
            <SelectTrigger id={id} aria-invalid={fieldState.invalid || undefined}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {optional ? <SelectItem value={NONE}>Not specified</SelectItem> : null}
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldShell>
      )}
    />
  );
}

export function SwitchField({
  control,
  name,
  label,
  hint,
  className,
  description,
}: BaseFieldProps & { description?: string }) {
  const id = useId();
  const tooltip = hint ?? DESCRIPTIONS[name];
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div
          className={cn(
            "flex items-start justify-between gap-4 rounded-lg border bg-card p-4",
            className,
          )}
        >
          <div className="space-y-1">
            <Label htmlFor={id} className="cursor-pointer">
              {label}
            </Label>
            {(description ?? tooltip) ? (
              <p className="text-sm text-muted-foreground">{description ?? tooltip}</p>
            ) : null}
          </div>
          <Switch id={id} checked={field.value === true} onCheckedChange={field.onChange} />
        </div>
      )}
    />
  );
}

/** Comma-separated list stored as string[]. */
export function TagsField({
  control,
  name,
  label,
  hint,
  className,
  placeholder,
  upper,
}: BaseFieldProps & { placeholder?: string; upper?: boolean }) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TagsInput
          id={id}
          label={label}
          hint={hint}
          name={name}
          className={className}
          placeholder={placeholder}
          upper={upper}
          error={fieldState.error?.message}
          value={Array.isArray(field.value) ? (field.value as string[]) : []}
          onChange={field.onChange}
          onBlur={field.onBlur}
        />
      )}
    />
  );
}

function TagsInput({
  id,
  label,
  hint,
  name,
  className,
  placeholder,
  upper,
  error,
  value,
  onChange,
  onBlur,
}: {
  id: string;
  label: string;
  hint?: string;
  name: string;
  className?: string;
  placeholder?: string;
  upper?: boolean;
  error?: string;
  value: string[];
  onChange: (v: string[]) => void;
  onBlur: () => void;
}) {
  const [text, setText] = useState(value.join(", "));
  useEffect(() => {
    // Sync when the form is reset (e.g. loading the example).
    setText((t) => (parse(t, upper).join(",") === value.join(",") ? t : value.join(", ")));
  }, [value, upper]);
  return (
    <FieldShell id={id} label={label} hint={hint} name={name} error={error} className={className}>
      <Input
        id={id}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parse(e.target.value, upper));
        }}
        onBlur={() => {
          setText(parse(text, upper).join(", "));
          onBlur();
        }}
      />
      <p className="text-xs text-muted-foreground">Separate with commas.</p>
    </FieldShell>
  );
}

function parse(text: string, upper?: boolean): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (upper ? s.toUpperCase() : s));
}

export function TextareaField({
  control,
  name,
  label,
  hint,
  className,
  placeholder,
  rows = 5,
  maxLength,
  optional,
}: BaseFieldProps & {
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  optional?: boolean;
}) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const v = typeof field.value === "string" ? field.value : "";
        return (
          <FieldShell
            id={id}
            label={label}
            hint={hint}
            name={name}
            error={fieldState.error?.message}
            className={className}
          >
            <Textarea
              id={id}
              rows={rows}
              placeholder={placeholder}
              maxLength={maxLength}
              value={v}
              onChange={(e) =>
                field.onChange(optional && e.target.value === "" ? undefined : e.target.value)
              }
              onBlur={field.onBlur}
              ref={field.ref}
            />
            {maxLength ? (
              <p className="text-right text-xs text-muted-foreground">
                {v.length}/{maxLength}
              </p>
            ) : null}
          </FieldShell>
        );
      }}
    />
  );
}

export function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold tracking-[-0.5px]">{title}</h2>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

export function Grid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 }) {
  return (
    <div className={cn("grid gap-4", cols === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
      {children}
    </div>
  );
}
