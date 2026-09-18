import type Anthropic from "@anthropic-ai/sdk";

import type { StartupInput } from "@/lib/schema/startup";
import { getAiConfig, getClient, webSearchToolType } from "./client";
import { MARKET_SYSTEM, marketUserMessage } from "./prompts";
import { MARKET_TOOL, MarketEstimate } from "./schemas";
import { toolInput } from "./score";

const MAX_TURNS = 8;

/** True when the founder left any of TAM/SAM/SOM empty. */
export function needsMarketEstimate(input: StartupInput): boolean {
  const { tamUsd, samUsd, somUsd } = input.market;
  return tamUsd === undefined || samUsd === undefined || somUsd === undefined;
}

/**
 * 6.2 — estimate TAM/SAM/SOM. With ENABLE_WEB_SEARCH the Anthropic web-search
 * server tool is enabled so the model can cite public market reports; the
 * loop resumes `pause_turn` responses and stops once the model calls
 * submit_market_estimate.
 */
export async function estimateMarket(input: StartupInput): Promise<MarketEstimate> {
  const client = getClient();
  if (!client) throw new Error("AI unavailable: ANTHROPIC_API_KEY is not set.");
  const cfg = getAiConfig();

  const tools: Anthropic.Messages.ToolUnion[] = [MARKET_TOOL];
  if (cfg.webSearch) {
    tools.unshift({
      type: webSearchToolType(cfg.model),
      name: "web_search",
      max_uses: 5,
    } as Anthropic.Messages.ToolUnion);
  }

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: marketUserMessage(input) }];
  const seenSources = new Map<string, { title: string; url?: string }>();
  let nudged = false;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: cfg.model,
      max_tokens: 8192,
      temperature: cfg.temperature,
      system: MARKET_SYSTEM,
      tools,
      tool_choice: { type: "auto" },
      messages,
    });

    collectSearchSources(response, seenSources);

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    const called = response.content.some(
      (b) => b.type === "tool_use" && b.name === MARKET_TOOL.name,
    );
    if (called) {
      const out = toolInput(response, MARKET_TOOL.name, (raw) =>
        MarketEstimate.parse(normalise(raw)),
      );
      // Merge cited search results the model did not list explicitly.
      const listed = new Set(out.sources.map((s) => s.url ?? s.title));
      for (const s of seenSources.values()) {
        if (out.sources.length >= 20) break;
        if (!listed.has(s.url ?? s.title)) out.sources.push(s);
      }
      return out;
    }

    if (response.stop_reason === "refusal")
      throw new Error("The model declined the market estimate.");
    if (nudged) throw new Error("The model did not call submit_market_estimate.");
    // The model answered in prose (or stopped after searching): ask for the tool call once.
    nudged = true;
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: "Now call submit_market_estimate with your final numbers. Do not answer in prose.",
    });
  }
  throw new Error("Market estimation exceeded the turn limit.");
}

function normalise(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as Record<string, unknown>;
  const sources = Array.isArray(r.sources)
    ? r.sources.map((s) => {
        const src = (s ?? {}) as Record<string, unknown>;
        return {
          title: String(src.title ?? ""),
          url: typeof src.url === "string" ? src.url : undefined,
        };
      })
    : [];
  return { ...r, sources };
}

function collectSearchSources(
  response: Anthropic.Message,
  into: Map<string, { title: string; url?: string }>,
) {
  for (const block of response.content) {
    if (block.type !== "web_search_tool_result") continue;
    const content = block.content;
    if (!Array.isArray(content)) continue; // an error object, not results
    for (const r of content) {
      if (r.type === "web_search_result" && r.url && !into.has(r.url)) {
        into.set(r.url, { title: r.title || r.url, url: r.url });
      }
    }
  }
}
