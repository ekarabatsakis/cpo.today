import { describe, expect, it } from "vitest";
import { detectStage } from "@/lib/engine/stage";
import { plugSecure } from "@/lib/schema/examples";
import { makeInput } from "./fixtures";

describe("stage detection", () => {
  it("ARR ≥ $5M → series_b_plus", () => {
    expect(detectStage(makeInput({ traction: { payingCustomers: 50, arrUsd: 6e6 } })).stage).toBe(
      "series_b_plus",
    );
  });

  it("a priced Series B → series_b_plus even with small ARR", () => {
    const input = makeInput({
      traction: { payingCustomers: 1, arrUsd: 10_000 },
      funding: {
        rounds: [{ type: "series_b", date: "2025-01-01", amountUsd: 20e6, postMoneyUsd: 80e6 }],
      },
    });
    expect(detectStage(input).stage).toBe("series_b_plus");
  });

  it("ARR ≥ $1M → series_a", () => {
    expect(detectStage(makeInput({ traction: { payingCustomers: 10, arrUsd: 1.2e6 } })).stage).toBe(
      "series_a",
    );
  });

  it("a priced Series A → series_a", () => {
    const input = makeInput({
      funding: {
        rounds: [{ type: "series_a", date: "2025-01-01", amountUsd: 5e6, postMoneyUsd: 25e6 }],
      },
    });
    expect(detectStage(input).stage).toBe("series_a");
  });

  it("ARR ≥ $150k → seed", () => {
    expect(
      detectStage(makeInput({ traction: { payingCustomers: 2, arrUsd: 200_000 } })).stage,
    ).toBe("seed");
  });

  it("5 paying customers → seed regardless of ARR", () => {
    expect(detectStage(makeInput({ traction: { payingCustomers: 5, arrUsd: 0 } })).stage).toBe(
      "seed",
    );
  });

  it("a Seed round only counts when post-money ≥ $4M", () => {
    const seedRound = (post: number) =>
      makeInput({
        funding: {
          rounds: [{ type: "seed", date: "2025-01-01", amountUsd: 1e6, postMoneyUsd: post }],
        },
        ip: { productStage: "mvp", techDefensibility: "medium" },
      });
    expect(detectStage(seedRound(5e6)).stage).toBe("seed");
    // $3M post: not seed by that rule, but MVP + ≥ $100k raised → pre_seed
    expect(detectStage(seedRound(3e6)).stage).toBe("pre_seed");
  });

  it("MVP with a paying customer → pre_seed", () => {
    expect(detectStage(makeInput({ traction: { payingCustomers: 1 } })).stage).toBe("pre_seed");
  });

  it("launched product with ≥ $100k raised → pre_seed", () => {
    const input = makeInput({
      ip: { productStage: "launched", techDefensibility: "medium" },
      funding: { totalRaisedUsd: 150_000 },
    });
    expect(detectStage(input).stage).toBe("pre_seed");
  });

  it("a prototype with a paying customer is still idea (needs MVP)", () => {
    const input = makeInput({
      ip: { productStage: "prototype", techDefensibility: "medium" },
      traction: { payingCustomers: 1 },
    });
    expect(detectStage(input).stage).toBe("idea");
  });

  it("nothing → idea", () => {
    expect(detectStage(makeInput()).stage).toBe("idea");
  });

  it("self-declared stage lifts by one step only with partial evidence", () => {
    // idea by rule, declared pre_seed, has a prototype → pre_seed
    const lifted = detectStage(
      makeInput({
        ip: { productStage: "prototype", techDefensibility: "medium" },
        selfDeclaredStage: "pre_seed",
      }),
    );
    expect(lifted.stage).toBe("pre_seed");
    expect(lifted.usedSelfDeclared).toBe(true);

    // idea by rule, declared seed (two steps) → stays idea
    expect(
      detectStage(
        makeInput({
          ip: { productStage: "prototype", techDefensibility: "medium" },
          selfDeclaredStage: "seed",
        }),
      ).stage,
    ).toBe("idea");

    // pre_seed by rule, declared seed, 3 paying customers → seed
    expect(
      detectStage(makeInput({ traction: { payingCustomers: 3 }, selfDeclaredStage: "seed" })).stage,
    ).toBe("seed");

    // pre_seed by rule, declared seed, only 1 customer and little raised → pre_seed
    expect(
      detectStage(makeInput({ traction: { payingCustomers: 1 }, selfDeclaredStage: "seed" })).stage,
    ).toBe("pre_seed");
  });

  it("never lowers the stage below what the data established", () => {
    const input = makeInput({
      traction: { payingCustomers: 2, arrUsd: 200_000 },
      selfDeclaredStage: "pre_seed",
    });
    expect(detectStage(input).stage).toBe("seed");
  });

  it("PlugSecure is pre_seed", () => {
    const d = detectStage(plugSecure());
    expect(d.stage).toBe("pre_seed");
    expect(d.usedSelfDeclared).toBe(false);
  });
});
