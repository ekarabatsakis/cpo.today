import type { Metadata } from "next";

import { Wizard } from "@/components/form/Wizard";

export const metadata: Metadata = {
  title: "Evaluate a startup",
  description: "Six steps: team, traction, funding, IP, market and review.",
};

export default function EvaluatePage() {
  return (
    <main className="px-4 py-12">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-foreground md:text-5xl">Evaluate a startup</h1>
          <p className="text-2xl text-muted-foreground">
            Six steps. Five minutes. Every number explained.
          </p>
        </div>
        <Wizard />
      </div>
    </main>
  );
}
