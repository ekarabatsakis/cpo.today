import Anthropic from "@anthropic-ai/sdk";

/** All AI configuration in one place. */
export interface AiConfig {
  enabled: boolean;
  model: string;
  webSearch: boolean;
  temperature: number;
}

export const DEFAULT_MODEL = "claude-sonnet-4-6";

export function getAiConfig(): AiConfig {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return {
    enabled: Boolean(key),
    model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
    webSearch: (process.env.ENABLE_WEB_SEARCH ?? "true").toLowerCase() !== "false",
    temperature: 0.2,
  };
}

let cached: Anthropic | null = null;

/** The Anthropic client, or null when no API key is configured (§6.4 failure mode). */
export function getClient(): Anthropic | null {
  const cfg = getAiConfig();
  if (!cfg.enabled) return null;
  if (!cached) {
    cached = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 120_000,
      maxRetries: 2,
    });
  }
  return cached;
}

/** Web-search tool type by model generation: 4.6+ and 5-family models use the 2026-02-09 variant. */
export function webSearchToolType(model: string): "web_search_20260209" | "web_search_20250305" {
  const nums = model
    .split("-")
    .filter((t) => /^\d+$/.test(t))
    .map(Number);
  const [major, minor = 0] = nums;
  if (major === undefined) return "web_search_20260209"; // unversioned alias: assume current
  return major >= 5 || (major === 4 && minor >= 6) ? "web_search_20260209" : "web_search_20250305";
}

/** Human-readable description of an SDK/API failure for the audit log. */
export function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError)
    return "Authentication failed: check ANTHROPIC_API_KEY.";
  if (e instanceof Anthropic.RateLimitError) return "Rate limited by the Anthropic API.";
  if (e instanceof Anthropic.APIConnectionError)
    return `Could not reach the Anthropic API: ${e.message}`;
  if (e instanceof Anthropic.APIError) return `Anthropic API error ${e.status ?? ""}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return String(e);
}
