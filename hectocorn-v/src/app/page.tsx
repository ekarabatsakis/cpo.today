import Link from "next/link";
import {
  Anchor,
  ArrowRight,
  BarChart3,
  Calculator,
  ClipboardList,
  FileDown,
  Layers,
  ListChecks,
  Scale,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
  {
    icon: Scale,
    title: "Transparent methods",
    description:
      "Scorecard, Berkus, Risk-Factor Summation, VC Method, Revenue Multiples and a Last-Round Anchor, blended with a weighted geometric mean. Every constant is in one editable file.",
  },
  {
    icon: Sparkles,
    title: "AI investment memo",
    description:
      "Claude scores the qualitative inputs, fills in missing market data and writes a sceptical investor memo. It may move the number by at most ±25%, always with a written rationale.",
  },
  {
    icon: FileDown,
    title: "Instant PDF report",
    description:
      "A branded, shareable report with the headline number, the range, every method's contribution and the memo. Addressable by an unguessable link.",
  },
];

const methods = [
  {
    icon: ClipboardList,
    title: "Scorecard",
    description:
      "Stage and region median, adjusted by team, market, product, traction, moat and deal quality.",
  },
  {
    icon: Layers,
    title: "Berkus",
    description: "Five pre-revenue value drivers, each worth up to a capped amount, summed.",
  },
  {
    icon: ListChecks,
    title: "Risk-Factor Summation",
    description: "Twelve risk categories rated −2 to +2, each moving the stage median up or down.",
  },
  {
    icon: TrendingUp,
    title: "VC Method",
    description:
      "Exit value in 4–8 years discounted by the return a fund needs at your stage, net of dilution.",
  },
  {
    icon: BarChart3,
    title: "Revenue Multiples",
    description: "Sector EV/ARR multiples, tilted by growth, retention, margin and churn.",
  },
  {
    icon: Anchor,
    title: "Last-Round Anchor",
    description: "Your last priced post-money, stepped up by the traction you have added since.",
  },
];

const steps = [
  {
    n: "1",
    title: "Describe the startup",
    description:
      "A six-step form covers team, traction, funding, IP, market and risks. Autosaves as you go.",
  },
  {
    n: "2",
    title: "The engine runs",
    description:
      "Stage is inferred from the data, seven methods run, and a weighted geometric mean blends them.",
  },
  {
    n: "3",
    title: "Claude reviews",
    description:
      "Qualitative scores, a market estimate when you have none, and a memo with a bounded adjustment.",
  },
];

export default function Home() {
  return (
    <main>
      <section className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/10 px-4">
        <div className="mx-auto max-w-6xl py-20 text-center">
          <h1 className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-5xl font-bold leading-tight text-transparent md:text-7xl">
            Know what your startup is worth.
          </h1>
          <p className="mx-auto mt-6 max-w-3xl text-2xl text-muted-foreground">
            Seven transparent valuation methods, one number, plus an AI investment memo and a
            shareable PDF report. Deterministic first, AI second.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button asChild size="lg" className="h-11 px-8">
              <Link href="/evaluate">
                Evaluate a startup <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="h-11 px-8 text-muted-foreground">
              <Link href="/methodology">See the methodology</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-4xl font-bold text-foreground md:text-5xl">
            How it works
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <Card key={s.n} className="transition-shadow hover:shadow-lg">
                <CardHeader>
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-xl font-semibold text-primary">
                    {s.n}
                  </div>
                  <CardTitle className="pt-2">{s.title}</CardTitle>
                  <CardDescription className="text-base">{s.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-secondary/40 px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 md:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title} className="transition-shadow hover:shadow-lg">
                <CardHeader>
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <f.icon className="h-6 w-6 text-primary" aria-hidden="true" />
                  </div>
                  <CardTitle className="pt-2">{f.title}</CardTitle>
                  <CardDescription className="text-base">{f.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-4xl font-bold text-foreground md:text-5xl">
            Seven methods, one number
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-center text-2xl text-muted-foreground">
            Six valuation methods are blended by stage. A seventh, the market-size cross-check, caps
            the result at what the reachable market can support.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {methods.map((m) => (
              <Card key={m.title} className="transition-shadow hover:shadow-lg">
                <CardHeader>
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <m.icon className="h-6 w-6 text-primary" aria-hidden="true" />
                  </div>
                  <CardTitle className="pt-2">{m.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-base text-muted-foreground">{m.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-br from-primary/5 via-background to-secondary/10 px-4 py-20">
        <div className="mx-auto max-w-6xl text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Calculator className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <h2 className="mt-6 text-4xl font-bold text-foreground md:text-5xl">
            Ready when you are
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-2xl text-muted-foreground">
            Five minutes of input. A number you can defend, with every step of the reasoning on the
            page.
          </p>
          <div className="mt-10">
            <Button asChild size="lg" className="h-11 px-8">
              <Link href="/evaluate">
                Evaluate a startup <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
