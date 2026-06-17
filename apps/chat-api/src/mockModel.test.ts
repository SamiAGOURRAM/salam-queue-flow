/**
 * Locks the mock model's routing: discovery intents must emit the right tool
 * call (so real MCP tools run), and a returned tool result must be summarized
 * honoring the real outcome. This is dev infrastructure for offline/zero-token
 * work, so its behavior is pinned.
 */
import { describe, it, expect } from "vitest";
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";
import { createMockModel } from "./mockModel.js";

const TOOLS = ["doctor_search", "clinic_search"];

function callOptions(userText: string, toolResult?: string): LanguageModelV2CallOptions {
  const prompt: LanguageModelV2CallOptions["prompt"] = [
    { role: "user", content: [{ type: "text", text: userText }] },
  ];
  if (toolResult !== undefined) {
    prompt.push(
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "t1", toolName: "doctor_search", input: "{}" }] },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "t1", toolName: "doctor_search", output: { type: "text", value: toolResult } }] },
    );
  }
  return {
    prompt,
    tools: TOOLS.map((name) => ({ type: "function", name, inputSchema: { type: "object", properties: {} } })),
  };
}

async function drain(userText: string, toolResult?: string): Promise<LanguageModelV2StreamPart[]> {
  const model = createMockModel() as LanguageModelV2;
  const { stream } = await model.doStream(callOptions(userText, toolResult));
  const parts: LanguageModelV2StreamPart[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  return parts;
}

function toolCallOf(parts: LanguageModelV2StreamPart[]): string | undefined {
  const tc = parts.find((p) => p.type === "tool-call");
  return tc && tc.type === "tool-call" ? tc.toolName : undefined;
}

function textOf(parts: LanguageModelV2StreamPart[]): string {
  return parts
    .filter((p): p is Extract<LanguageModelV2StreamPart, { type: "text-delta" }> => p.type === "text-delta")
    .map((p) => p.delta)
    .join("");
}

describe("mock model routing", () => {
  it("routes a doctor query to doctor_search", async () => {
    expect(toolCallOf(await drain("find a doctor in Casablanca"))).toBe("doctor_search");
  });

  it("routes a clinic query to clinic_search", async () => {
    expect(toolCallOf(await drain("find a clinic in Rabat"))).toBe("clinic_search");
  });

  it("summarizes a successful tool result as found", async () => {
    const text = textOf(await drain("find a doctor in Casablanca", '{"success":true,"count":1}'));
    expect(text.toLowerCase()).toContain("found");
  });

  it("summarizes a no-results tool result honestly", async () => {
    const text = textOf(await drain("find a doctor in Casablanca", "TOOL_RESULT: no matching results were found."));
    expect(text.toLowerCase()).toContain("couldn't find");
  });

  it("emits a booking_create call for a booking intent when the tool is available", async () => {
    const model = createMockModel() as LanguageModelV2;
    const opts: LanguageModelV2CallOptions = {
      prompt: [{ role: "user", content: [{ type: "text", text: "I want to book an appointment" }] }],
      tools: ["doctor_search", "booking_create"].map((name) => ({ type: "function", name, inputSchema: { type: "object", properties: {} } })),
    };
    const { stream } = await model.doStream(opts);
    const parts: LanguageModelV2StreamPart[] = [];
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
    }
    expect(toolCallOf(parts)).toBe("booking_create");
  });

  it("does NOT emit a booking call when the tool is unavailable (anonymous)", async () => {
    // default drain() exposes only doctor_search/clinic_search
    const parts = await drain("I want to book an appointment");
    expect(toolCallOf(parts)).toBeUndefined();
  });

  it("falls back to a text greeting with no discovery intent", async () => {
    const parts = await drain("hello");
    expect(toolCallOf(parts)).toBeUndefined();
    expect(textOf(parts).toLowerCase()).toContain("mock mode");
  });
});
