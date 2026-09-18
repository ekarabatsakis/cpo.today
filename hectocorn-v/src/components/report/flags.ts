/** Human-readable explanations for engine flags. */
export function describeFlag(flag: string): string {
  const [key, arg] = flag.split(":");
  switch (key) {
    case "missing_market_size":
      return "TAM/SAM/SOM were not supplied. The VC method needs a market size when pre-revenue, and no market ceiling could be applied.";
    case "market_ceiling_applied":
      return "The blended number exceeded 3× the serviceable obtainable market and was capped.";
    case "low_confidence_wide_range":
      return "The methods disagree strongly (confidence below 50), so the range was widened to ×0.55 / ×1.70.";
    case "few_methods":
      return "Fewer than three methods were applicable; treat the number with extra caution.";
    case "method_floored":
      return `The ${arg} method produced a near-zero value and was floored at $50k inside the blend.`;
    case "stage_tiebreaker_self_declared":
      return "The self-declared stage was used to break a tie between two adjacent stages.";
    case "market_size_estimated_by_ai":
      return "The market size (TAM/SAM/SOM) was estimated by the AI layer, not supplied by the founder.";
    case "fallback_stage_median":
      return "No method was applicable; the stage median × region factor was used.";
    default:
      return flag;
  }
}
