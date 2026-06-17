/**
 * Provider-agnostic LLM model resolution.
 *
 * Returns `null` when no API key is configured for the selected provider, which
 * signals the agent to fall back to a deterministic mock responder so the
 * service still runs (and demos) without any paid key.
 */
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { config } from "./config.js";
import { createMockModel } from "./mockModel.js";

export function resolveModel(): { model: LanguageModel; label: string } | null {
  switch (config.llmProvider) {
    case "mock":
      // Deterministic, zero-cost model that drives the real tool/stream pipeline.
      // Use during development to avoid burning provider quota (e.g. Groq's TPD).
      return { model: createMockModel(), label: "mock:rule-based" };
    case "openai":
      if (!config.openaiApiKey) return null;
      return {
        model: createOpenAI({ apiKey: config.openaiApiKey })(config.openaiModel),
        label: `openai:${config.openaiModel}`,
      };
    case "anthropic":
      if (!config.anthropicApiKey) return null;
      return {
        model: createAnthropic({ apiKey: config.anthropicApiKey })(config.anthropicModel),
        label: `anthropic:${config.anthropicModel}`,
      };
    case "groq":
    default:
      if (!config.groqApiKey) return null;
      return {
        model: createGroq({ apiKey: config.groqApiKey })(config.groqModel),
        label: `groq:${config.groqModel}`,
      };
  }
}
