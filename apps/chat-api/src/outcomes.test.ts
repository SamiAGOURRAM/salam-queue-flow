import { describe, it, expect } from "vitest";
import { classifyToolResult, aggregateOutcomes, summarizeForModel } from "./outcomes.js";

const err = (code: string, message = "x") =>
  JSON.stringify({ success: false, error: { code, message } });

describe("classifyToolResult", () => {
  it("isError + INTERNAL_ERROR 'fetch failed' → backend_unavailable (the Casablanca bug, locked)", () => {
    expect(
      classifyToolResult({ isError: true, text: err("INTERNAL_ERROR", "fetch failed") }),
    ).toBe("backend_unavailable");
  });

  it("isError + AUTHORIZATION_ERROR → forbidden", () => {
    expect(classifyToolResult({ isError: true, text: err("AUTHORIZATION_ERROR") })).toBe("forbidden");
  });

  it("isError + AUTHENTICATION_ERROR → forbidden", () => {
    expect(classifyToolResult({ isError: true, text: err("AUTHENTICATION_ERROR") })).toBe("forbidden");
  });

  it("isError + DATABASE_ERROR → backend_unavailable", () => {
    expect(classifyToolResult({ isError: true, text: err("DATABASE_ERROR") })).toBe("backend_unavailable");
  });

  it("isError + non-JSON text → backend_unavailable", () => {
    expect(classifyToolResult({ isError: true, text: "boom" })).toBe("backend_unavailable");
  });

  it("success + count:0 → no_results", () => {
    expect(
      classifyToolResult({ isError: false, text: JSON.stringify({ success: true, count: 0, clinics: [] }) }),
    ).toBe("no_results");
  });

  it("success + count:2 → ok", () => {
    expect(
      classifyToolResult({
        isError: false,
        text: JSON.stringify({ success: true, count: 2, clinics: [{ id: "c1" }, { id: "c2" }] }),
      }),
    ).toBe("ok");
  });

  it("success + JSON without a count key (e.g. availability) → ok", () => {
    expect(
      classifyToolResult({ isError: false, text: JSON.stringify({ success: true, available: true, slots: [] }) }),
    ).toBe("ok");
  });

  it("success body carrying success:false + VALIDATION_ERROR → backend_unavailable", () => {
    expect(classifyToolResult({ isError: false, text: err("VALIDATION_ERROR") })).toBe("backend_unavailable");
  });

  it("success body carrying success:false + AUTHORIZATION_ERROR → forbidden", () => {
    expect(classifyToolResult({ isError: false, text: err("AUTHORIZATION_ERROR") })).toBe("forbidden");
  });

  it("success + non-JSON plain text → ok", () => {
    expect(classifyToolResult({ isError: false, text: "Here is one clinic in Casablanca." })).toBe("ok");
  });
});

describe("aggregateOutcomes (worst wins)", () => {
  it("returns undefined when no tool ran", () => {
    expect(aggregateOutcomes([])).toBeUndefined();
  });

  it("[ok, no_results] → no_results", () => {
    expect(aggregateOutcomes(["ok", "no_results"])).toBe("no_results");
  });

  it("[no_results, backend_unavailable] → backend_unavailable", () => {
    expect(aggregateOutcomes(["no_results", "backend_unavailable"])).toBe("backend_unavailable");
  });

  it("[backend_unavailable, forbidden] → forbidden", () => {
    expect(aggregateOutcomes(["backend_unavailable", "forbidden"])).toBe("forbidden");
  });

  it("[ok, ok] → ok", () => {
    expect(aggregateOutcomes(["ok", "ok"])).toBe("ok");
  });
});

describe("summarizeForModel", () => {
  it("ok: strips the `cards` key (no branded href reaches the model) but keeps the data", () => {
    const text = JSON.stringify({
      success: true,
      count: 1,
      clinics: [{ id: "c1", name: "Casa Family Care" }],
      cards: { kind: "clinic_cards", items: [{ clinicId: "c1", bookingHref: "/booking/c1" }] },
    });
    const out = summarizeForModel("ok", text);
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect("cards" in parsed).toBe(false);
    expect(parsed.count).toBe(1);
    expect(out).not.toContain("bookingHref");
  });

  it("ok: non-JSON text returned unchanged", () => {
    expect(summarizeForModel("ok", "plain answer")).toBe("plain answer");
  });

  it("backend_unavailable: tells the model to ask the user to retry", () => {
    expect(summarizeForModel("backend_unavailable", "")).toContain("try again");
  });

  it("no_results: tells the model nothing matched", () => {
    expect(summarizeForModel("no_results", "")).toContain("no matching results");
  });

  it("forbidden: tells the model permission was denied", () => {
    expect(summarizeForModel("forbidden", "")).toContain("permission denied");
  });
});
