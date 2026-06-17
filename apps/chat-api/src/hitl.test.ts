/**
 * Locks the HITL mutation gate: a gated booking tool runs ONLY when the user has
 * explicitly approved it, and is otherwise never executed. This is the core
 * Phase C guarantee ("0 mutations execute without explicit confirm").
 */
import { describe, it, expect } from "vitest";
import { processApprovedBookings, DECLINED_RESULT } from "./hitl.js";

function fakeSession() {
  const calls: Array<{ name: string; args: unknown }> = [];
  return {
    calls,
    executeTool: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return { outcome: "ok" as const, summary: `BOOKED:${name}` };
    },
  };
}

function assistantWith(part: Record<string, unknown>) {
  return [{ role: "assistant", parts: [part] }];
}

describe("processApprovedBookings (HITL gate)", () => {
  it("executes an APPROVED booking and rewrites the result", async () => {
    const session = fakeSession();
    const messages = assistantWith({
      type: "tool-booking_create",
      toolCallId: "t1",
      state: "output-available",
      input: { clinicId: "c1" },
      output: { approved: true },
    });
    const n = await processApprovedBookings(messages, session);
    expect(n).toBe(1);
    expect(session.calls).toEqual([{ name: "booking_create", args: { clinicId: "c1" } }]);
    expect((messages[0].parts[0] as { output: unknown }).output).toBe("BOOKED:booking_create");
  });

  it("does NOT execute a DECLINED booking", async () => {
    const session = fakeSession();
    const messages = assistantWith({
      type: "tool-booking_create",
      toolCallId: "t1",
      input: { clinicId: "c1" },
      output: { approved: false },
    });
    await processApprovedBookings(messages, session);
    expect(session.calls).toHaveLength(0);
    expect((messages[0].parts[0] as { output: unknown }).output).toBe(DECLINED_RESULT);
  });

  it("does NOT execute an UNCONFIRMED booking (no approval result yet)", async () => {
    const session = fakeSession();
    const messages = assistantWith({
      type: "tool-booking_create",
      toolCallId: "t1",
      state: "input-available",
      input: { clinicId: "c1" },
    });
    const n = await processApprovedBookings(messages, session);
    expect(n).toBe(0);
    expect(session.calls).toHaveLength(0);
  });

  it("is idempotent — an already-executed booking is not re-run", async () => {
    const session = fakeSession();
    const messages = assistantWith({
      type: "tool-booking_create",
      toolCallId: "t1",
      input: { clinicId: "c1" },
      output: "BOOKED:booking_create", // already a real result, not an approval sentinel
    });
    await processApprovedBookings(messages, session);
    expect(session.calls).toHaveLength(0);
  });

  it("handles the dynamic-tool wire shape", async () => {
    const session = fakeSession();
    const messages = assistantWith({
      type: "dynamic-tool",
      toolName: "booking_cancel",
      toolCallId: "t1",
      input: { appointmentId: "a1" },
      output: { approved: true },
    });
    await processApprovedBookings(messages, session);
    expect(session.calls).toEqual([{ name: "booking_cancel", args: { appointmentId: "a1" } }]);
  });

  it("ignores a non-gated tool even with an approval-shaped output", async () => {
    const session = fakeSession();
    const messages = assistantWith({
      type: "tool-doctor_search",
      toolCallId: "t1",
      input: { city: "Casablanca" },
      output: { approved: true },
    });
    await processApprovedBookings(messages, session);
    expect(session.calls).toHaveLength(0);
  });
});
