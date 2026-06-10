import { describe, it, expect } from "vitest";
import { parseCards } from "./mcp.js";

describe("parseCards", () => {
  it("returns the cards payload when the tool-result JSON carries non-empty cards", () => {
    const cards = { kind: "clinic_cards", items: [{ clinicId: "c1", name: "Casa Family Care", bookingHref: "/booking/c1" }] };
    const text = JSON.stringify({ success: true, count: 1, clinics: [], cards });
    expect(parseCards(text)).toEqual(cards);
  });

  it("returns undefined when the JSON has no cards field", () => {
    expect(parseCards(JSON.stringify({ success: true, count: 0 }))).toBeUndefined();
  });

  it("returns undefined when cards is null/undefined/empty", () => {
    expect(parseCards(JSON.stringify({ cards: null }))).toBeUndefined();
    expect(parseCards(JSON.stringify({ cards: undefined }))).toBeUndefined();
  });

  it("returns undefined for non-JSON tool output (plain text)", () => {
    expect(parseCards("There is one clinic in Casablanca: Casa Family Care.")).toBeUndefined();
  });
});
