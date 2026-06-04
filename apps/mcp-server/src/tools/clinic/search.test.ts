import { describe, it, expect } from "vitest";
import { buildClinicCards } from "./search.js";

// buildClinicCards mints branded BookingHrefs; compare them as plain strings.
const hrefs = (cards: ReturnType<typeof buildClinicCards>): string[] =>
  cards?.kind === "clinic_cards" ? cards.items.map((i) => i.bookingHref as string) : [];

describe("buildClinicCards", () => {
  it("returns undefined for an empty result set (NonEmptyArray contract)", () => {
    expect(buildClinicCards([])).toBeUndefined();
  });

  it("maps a clinic to a clinic_cards payload with all public fields", () => {
    const cards = buildClinicCards([
      {
        id: "c1",
        name: "Casa Family Care",
        specialty: "Dermatologie",
        city: "Casablanca",
        address: "12 Rue X",
        phoneNumber: "+212600000000",
      },
    ]);
    expect(cards).toEqual({
      kind: "clinic_cards",
      items: [
        {
          clinicId: "c1",
          name: "Casa Family Care",
          specialty: "Dermatologie",
          city: "Casablanca",
          address: "12 Rue X",
          phoneNumber: "+212600000000",
          bookingHref: "/booking/c1",
        },
      ],
    });
  });

  it("builds a code-generated bookingHref from the clinic id", () => {
    expect(hrefs(buildClinicCards([{ id: "c2", name: "X" }]))).toEqual(["/booking/c2"]);
  });

  it("percent-encodes special characters in the clinic id", () => {
    expect(hrefs(buildClinicCards([{ id: "a b", name: "Y" }]))).toEqual(["/booking/a%20b"]);
  });

  it("leaves optional fields undefined when absent (no crash)", () => {
    const cards = buildClinicCards([{ id: "c3", name: "Solo" }]);
    expect(cards?.kind).toBe("clinic_cards");
    const item = cards?.kind === "clinic_cards" ? cards.items[0] : undefined;
    expect(item).toMatchObject({ clinicId: "c3", name: "Solo", bookingHref: "/booking/c3" });
    expect(item?.specialty).toBeUndefined();
    expect(item?.city).toBeUndefined();
  });

  it("maps multiple clinics, each with a distinct bookingHref", () => {
    const cards = buildClinicCards([
      { id: "c1", name: "A" },
      { id: "c2", name: "B" },
    ]);
    expect(cards?.kind === "clinic_cards" && cards.items.length).toBe(2);
    expect(hrefs(cards)).toEqual(["/booking/c1", "/booking/c2"]);
  });
});
