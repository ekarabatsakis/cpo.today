"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

export interface StepMeta {
  key: string;
  title: string;
  short: string;
}

export function StepIndicator({
  steps,
  current,
  furthest,
  onSelect,
}: {
  steps: StepMeta[];
  current: number;
  /** Highest step index the user has reached; earlier steps are clickable. */
  furthest: number;
  onSelect: (index: number) => void;
}) {
  return (
    <nav aria-label="Progress">
      <ol className="flex items-center gap-2 overflow-x-auto pb-1">
        {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          const reachable = i <= furthest;
          return (
            <li key={step.key} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onSelect(i)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium transition-colors",
                  active
                    ? "text-foreground"
                    : reachable
                      ? "text-muted-foreground hover:text-foreground"
                      : "cursor-not-allowed text-muted-foreground/60",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : done
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="hidden whitespace-nowrap md:inline">{step.title}</span>
                <span className="whitespace-nowrap md:hidden">{step.short}</span>
              </button>
              {i < steps.length - 1 ? (
                <span
                  className={cn("h-px w-4 shrink-0 md:w-8", done ? "bg-primary" : "bg-border")}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
