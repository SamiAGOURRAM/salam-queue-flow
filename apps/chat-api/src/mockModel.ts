/**
 * A deterministic, zero-cost fake `LanguageModel` that drives the REAL agent
 * loop — so the entire pipeline (MCP tool execution, auth/RBAC, streaming, typed
 * data parts, and the Phase C HITL gate) runs exactly as in production. Only the
 * model's token output is faked. Enable with `LLM_PROVIDER=mock`.
 *
 * It is NOT an LLM: it inspects the conversation with a few rules and emits
 *  - a `doctor_search` / `clinic_search` tool call for discovery intents (so the
 *    real MCP tools run and real cards stream back), then
 *  - a short text summary that honors the real tool outcome (found vs none), or
 *  - a canned guidance/fallback reply otherwise.
 *
 * Implemented as a plain `LanguageModelV2` object (NOT `ai/test`'s mock, which
 * pulls `msw` in at runtime) using `simulateReadableStream` from the core `ai`
 * package, so it satisfies the contract `streamText` expects with no test deps.
 */
import { simulateReadableStream } from "ai";
import type { LanguageModel } from "ai";
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Content,
  LanguageModelV2Prompt,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
} from "@ai-sdk/provider";

const ZERO_USAGE: LanguageModelV2Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

/** Seed clinic (Casa Family Care) + doctor (Dr. Karim Benjelloun) for the mock HITL booking flow. */
const SEED_CLINIC_ID = "00000000-0000-0000-0000-00000000c201";
const SEED_STAFF_ID = "00000000-0000-0000-0000-0000000d5001";

/** Cities the seed data + parser recognize (lower-case match). */
const MOROCCAN_CITIES = [
  "casablanca", "rabat", "marrakech", "marrakesh", "fes", "fès", "tangier", "tanger",
  "agadir", "meknes", "meknès", "oujda", "kenitra", "tetouan", "tétouan", "sale", "salé",
];

/** What the fake model decides to do for one generation step. */
type Decision =
  | { kind: "text"; text: string }
  | { kind: "tool"; toolName: string; args: Record<string, unknown> };

function properCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function findLastUserIndex(prompt: LanguageModelV2Prompt): number {
  for (let i = prompt.length - 1; i >= 0; i--) {
    if (prompt[i].role === "user") return i;
  }
  return -1;
}

/** Text of the most recent user message. */
function lastUserText(prompt: LanguageModelV2Prompt): string {
  const i = findLastUserIndex(prompt);
  if (i < 0) return "";
  const msg = prompt[i];
  if (msg.role !== "user") return "";
  return msg.content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ");
}

/**
 * If a tool already produced a result AFTER the last user message, return that
 * result's text (so the summary step can honor the real outcome); else null.
 */
function toolResultAfterLastUser(prompt: LanguageModelV2Prompt): string | null {
  const ui = findLastUserIndex(prompt);
  for (let i = prompt.length - 1; i > ui; i--) {
    const msg = prompt[i];
    if (msg.role !== "tool") continue;
    return msg.content
      .map((part) => {
        const out = (part as { output?: { type?: string; value?: unknown } }).output;
        if (!out) return "";
        if (out.type === "text" || out.type === "error-text") return String(out.value ?? "");
        return JSON.stringify(out.value ?? "");
      })
      .join(" ");
  }
  return null;
}

function extractCity(text: string): string | undefined {
  const m = text.match(/\b(?:in|at|à|a|near|dans|de)\s+([a-zàâçéèêëîïôûüù-]+)/i);
  if (m && MOROCCAN_CITIES.includes(m[1].toLowerCase())) return m[1];
  for (const c of MOROCCAN_CITIES) if (text.includes(c)) return c;
  return undefined;
}

/** Decide what the fake model "says" given the current conversation + tools. */
function decide(options: LanguageModelV2CallOptions): Decision {
  const prompt = options.prompt;
  const toolNames = new Set((options.tools ?? []).map((t) => t.name));
  const has = (name: string) => toolNames.has(name);

  // Step 2+: a tool already ran this turn — summarize honoring the real outcome.
  const toolResult = toolResultAfterLastUser(prompt);
  if (toolResult !== null) {
    if (/declined this action/i.test(toolResult)) {
      return { kind: "text", text: "No problem — I didn't book anything. Tell me if you'd like a different clinic or time." };
    }
    if (/appointmentId|queuePosition/i.test(toolResult)) {
      return { kind: "text", text: "You're booked! ✅ Your appointment is set — you'll get your queue position and reminders. Anything else?" };
    }
    if (/no matching results/i.test(toolResult)) {
      return {
        kind: "text",
        text: "I couldn't find any matches for that. I can search across Morocco — try another city or specialty (e.g. \"doctors in Rabat\").",
      };
    }
    if (/temporarily unavailable/i.test(toolResult)) {
      return { kind: "text", text: "I hit a problem completing that — please try again in a moment." };
    }
    if (/permission denied/i.test(toolResult)) {
      return { kind: "text", text: "You'll need to sign in to do that. Once signed in, I can continue." };
    }
    return { kind: "text", text: "Here's what I found — tap a card to start booking." };
  }

  // Step 1: classify the user's intent.
  const text = lastUserText(prompt).toLowerCase();
  const city = extractCity(text);
  const cityArg = city ? { city: properCase(city) } : {};

  const wantsDoctor = /\b(doctor|doctors|docteur|m[ée]decin|practitioner|provider|dermatolog|cardiolog|p[ée]diatr|gyn[ée]colog)\w*/i.test(text);
  const wantsClinic = /\b(clinic|clinics|clinique|hospital|h[ôo]pital|center|centre|cabinet)\w*/i.test(text);

  if (wantsDoctor && has("doctor_search")) return { kind: "tool", toolName: "doctor_search", args: cityArg };
  if (wantsClinic && has("clinic_search")) return { kind: "tool", toolName: "clinic_search", args: cityArg };

  // Generic discovery ("find … in <city>") defaults to doctors.
  if (city && /\b(find|search|show|near|list|looking|need|want)\b/.test(text) && has("doctor_search")) {
    return { kind: "tool", toolName: "doctor_search", args: cityArg };
  }

  if (/\b(book|appointment|rendez|r[ée]serv)\w*/i.test(text)) {
    // Booking is a gated mutation — emit the call (when available); the HITL gate
    // surfaces it for confirmation and runs it only after the user approves.
    if (has("booking_create")) {
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      return {
        kind: "tool",
        toolName: "booking_create",
        args: {
          clinicId: SEED_CLINIC_ID,
          staffId: SEED_STAFF_ID, // doctor-first: a provider is required
          appointmentDate: tomorrow,
          scheduledTime: "09:00", // seed clinic is slotted -> a concrete slot is required
          appointmentType: "consultation",
          reasonForVisit: "General consultation",
        },
      };
    }
    return {
      kind: "text",
      text: "I can help you book — please sign in first, then tell me the clinic and date and I'll set it up for you to confirm.",
    };
  }

  if (/\b(queue|file|wait|attente|position)\w*/i.test(text)) {
    return {
      kind: "text",
      text: "I can show your live queue position once you have an appointment. Want to find a clinic or doctor first?",
    };
  }

  return {
    kind: "text",
    text: "Hi! I'm the QueueMed assistant (mock mode — no LLM tokens used). I can find clinics and doctors across Morocco and help you book. Try \"find a doctor in Casablanca\".",
  };
}

function toolCallId(toolName: string): string {
  return `mock-${toolName}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Render a decision as a V2 stream (chunked text for a real streaming feel). */
function renderStream(d: Decision): LanguageModelV2StreamPart[] {
  const start: LanguageModelV2StreamPart = { type: "stream-start", warnings: [] };
  if (d.kind === "tool") {
    return [
      start,
      { type: "tool-call", toolCallId: toolCallId(d.toolName), toolName: d.toolName, input: JSON.stringify(d.args) },
      { type: "finish", finishReason: "tool-calls", usage: ZERO_USAGE },
    ];
  }
  const chunks = d.text.match(/\S+\s*/g) ?? [d.text];
  return [
    start,
    { type: "text-start", id: "0" },
    ...chunks.map((delta): LanguageModelV2StreamPart => ({ type: "text-delta", id: "0", delta })),
    { type: "text-end", id: "0" },
    { type: "finish", finishReason: "stop", usage: ZERO_USAGE },
  ];
}

/** Render a decision as non-streaming content (for the doGenerate path). */
function renderContent(d: Decision): LanguageModelV2Content[] {
  if (d.kind === "tool") {
    return [{ type: "tool-call", toolCallId: toolCallId(d.toolName), toolName: d.toolName, input: JSON.stringify(d.args) }];
  }
  return [{ type: "text", text: d.text }];
}

/** A deterministic LanguageModel that drives the real agent/tool pipeline. */
export function createMockModel(): LanguageModel {
  const model: LanguageModelV2 = {
    specificationVersion: "v2",
    provider: "mock",
    modelId: "queuemed-rule-based",
    supportedUrls: {},
    async doStream(options) {
      return { stream: simulateReadableStream({ chunks: renderStream(decide(options)), chunkDelayInMs: 8 }) };
    },
    async doGenerate(options) {
      const d = decide(options);
      return {
        content: renderContent(d),
        finishReason: d.kind === "tool" ? "tool-calls" : "stop",
        usage: ZERO_USAGE,
        warnings: [],
      };
    },
  };
  return model;
}
