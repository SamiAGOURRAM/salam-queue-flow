/**
 * MCP bridge: connects to the QueueMed MCP server (Streamable HTTP) as the
 * signed-in user and exposes its tools as Vercel AI SDK tools.
 *
 * The caller's Supabase JWT is forwarded on every MCP request, so the MCP
 * server enforces RBAC guardrails per user. tools/list already returns only the
 * tools this user may call.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { tool, jsonSchema, type ToolSet } from "ai";
import type { JSONSchema7 } from "json-schema";
import {
  classifyToolResult,
  aggregateOutcomes,
  summarizeForModel,
  type ToolOutcomeKind,
} from "./outcomes.js";

/**
 * Mutation tools gated behind human-in-the-loop (Phase C): they are exposed to
 * the model WITHOUT an `execute`, so a call surfaces to the client for explicit
 * confirmation instead of running automatically. chat-api runs them via
 * `executeTool` only after the user approves.
 */
export const HITL_TOOLS = new Set(["booking_create", "booking_cancel"]);

export interface McpSession {
  tools: ToolSet;
  /** Structured discovery `cards` captured from the last card-bearing tool result this request (or undefined). */
  getCollectedCards: () => unknown | undefined;
  /** Aggregate outcome across every tool called this request (worst wins), or undefined if no tool ran. */
  getOutcome: () => ToolOutcomeKind | undefined;
  /**
   * Directly invoke an MCP tool (bypassing the AI-SDK wrapper) and return its
   * compact model-facing summary. Used to execute a HITL mutation tool AFTER the
   * user has confirmed it. Card/outcome accumulators are updated as usual.
   */
  executeTool: (name: string, args: unknown) => Promise<{ outcome: ToolOutcomeKind; summary: string }>;
  close: () => Promise<void>;
}

function extractText(content: unknown): string {
  if (Array.isArray(content)) {
    const text = content
      .filter((c): c is { type: "text"; text: string } =>
        !!c && typeof c === "object" && (c as { type?: string }).type === "text")
      .map((c) => c.text)
      .join("\n");
    if (text) return text;
  }
  return JSON.stringify(content);
}

/**
 * If a flattened tool-result string is JSON carrying a non-empty `cards` field,
 * return that `cards` payload; otherwise undefined. Lets chat-api side-channel the
 * structured discovery cards WITHOUT changing the text the model receives.
 */
export function parseCards(text: string): unknown | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "cards" in parsed) {
      const cards = (parsed as { cards?: unknown }).cards;
      return cards ? cards : undefined;
    }
  } catch {
    // not JSON — nothing to capture
  }
  return undefined;
}

/**
 * Connect to the MCP server and build an AI SDK ToolSet bound to this session.
 */
export async function createMcpSession(mcpUrl: string, token?: string): Promise<McpSession> {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });

  const client = new Client({ name: "queuemed-chat-api", version: "0.1.0" });
  await client.connect(transport);

  const { tools: mcpTools } = await client.listTools();

  // Per-request accumulators: the latest structured `cards` payload a tool
  // returned, and every tool's classified outcome (aggregated worst-wins).
  let collectedCards: unknown | undefined;
  const outcomes: ToolOutcomeKind[] = [];

  // Shared executor: call the MCP tool, classify the result, capture cards, and
  // return both the outcome and the compact model-facing summary.
  const runTool = async (name: string, args: unknown): Promise<{ outcome: ToolOutcomeKind; summary: string }> => {
    const result = await client.callTool({
      name,
      arguments: (args ?? {}) as Record<string, unknown>,
    });
    const text = extractText(result.content);
    // Classify the raw result so the agent/UI can distinguish failure modes.
    const kind = classifyToolResult({ isError: !!result.isError, text });
    outcomes.push(kind);
    // Side-channel any discovery cards (last card-bearing tool wins).
    const cards = parseCards(text);
    if (cards) collectedCards = cards;
    // The model sees a compact, outcome-shaped summary — not the raw error JSON
    // (which would leak IDs/hrefs and let it paraphrase failures).
    return { outcome: kind, summary: summarizeForModel(kind, text) };
  };

  const tools: ToolSet = {};
  for (const t of mcpTools) {
    const base = {
      description: t.description ?? t.name,
      inputSchema: jsonSchema((t.inputSchema ?? { type: "object", properties: {} }) as JSONSchema7),
    };
    // HITL mutation tools are registered WITHOUT execute: a call surfaces to the
    // client and runs only after explicit confirmation (see agent.ts).
    tools[t.name] = HITL_TOOLS.has(t.name)
      ? tool(base)
      : tool({ ...base, execute: async (args: unknown) => (await runTool(t.name, args)).summary });
  }

  return {
    tools,
    getCollectedCards: () => collectedCards,
    getOutcome: () => aggregateOutcomes(outcomes),
    executeTool: runTool,
    close: async () => {
      await client.close();
    },
  };
}
