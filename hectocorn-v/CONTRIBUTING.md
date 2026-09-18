# Contributing to Hectocorn V

Thanks for helping. The engine is the heart of the project, so the bar for changes to it is a test.

## Setup

```bash
cp .env.example .env      # add ANTHROPIC_API_KEY to enable the AI layer (optional)
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

## Before you open a pull request

```bash
npm run lint         # zero warnings
npm run typecheck    # TypeScript strict, no `any`
npm test             # Vitest: the engine and the AI clamping
npm run build
npm run test:e2e     # Playwright (needs `npm run build` first)
```

Husky runs lint-staged on commit.

## Ground rules

- **Every number needs a method trail.** If you add or change a method, it must return `inputsUsed` and `notes`, and the report must show them.
- **Benchmarks live in one file.** Change `src/lib/engine/benchmarks.ts`, bump `BENCHMARKS_VERSION`, note the source and date, and update the tests that pin the PlugSecure fixture.
- **The server recomputes AI arithmetic.** Never trust a number the model returns; clamp, recompute and record both.
- **Offline first.** Anything you add must still work without an API key.
- **Schema is the single source of truth.** New inputs go into `src/lib/schema/startup.ts` with a `.describe()`; the form tooltips and the AI prompts read it.

## Adding a valuation method

1. Create `src/lib/engine/methods/<name>.ts` returning a `MethodResult`.
2. Add its key to `MethodKey` and a weight to `STAGE_WEIGHT_PRESETS` for every stage.
3. Add it to the list in `src/lib/engine/run.ts`.
4. Write tests with hand-computed expected values in `tests/engine/methods.test.ts`.
5. Describe it on the methodology page and in the README.

## Reporting a bug

Open an issue with the input JSON (from the report's audit trail or the `/api/report/[id]` endpoint), the number you got and the number you expected, and how you computed it.
