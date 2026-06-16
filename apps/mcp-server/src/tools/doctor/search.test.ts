import { describe, it, expect } from "vitest";
import { buildDoctorCards } from "./search.js";
import type { DoctorListing } from "@queuemed/core";

const doc = (over: Partial<DoctorListing> = {}): DoctorListing => ({
  staffId: "s1",
  clinicId: "c1",
  fullName: "Dr. Amina",
  role: "doctor",
  clinicName: "Casa Family Care",
  ...over,
});

const hrefs = (cards: ReturnType<typeof buildDoctorCards>): string[] =>
  cards?.kind === "doctor_cards" ? cards.items.map((i) => i.bookingHref as string) : [];

describe("buildDoctorCards", () => {
  it("returns undefined for an empty result set (NonEmptyArray contract)", () => {
    expect(buildDoctorCards([], new Map())).toBeUndefined();
  });

  it("maps a doctor to a doctor_cards item with slot + staff deep-link", () => {
    const cards = buildDoctorCards(
      [doc({ specialization: "Dermatology", city: "Casablanca" })],
      new Map([["s1", { kind: "datetime", value: "2026-06-05T09:30" }]]),
    );
    expect(cards).toEqual({
      kind: "doctor_cards",
      items: [
        {
          doctorId: "s1",
          fullName: "Dr. Amina",
          specialization: "Dermatology",
          clinicId: "c1",
          clinicName: "Casa Family Care",
          city: "Casablanca",
          nextAvailableSlot: { kind: "datetime", value: "2026-06-05T09:30" },
          bookingHref: "/booking/c1?staffId=s1",
        },
      ],
    });
  });

  it("leaves nextAvailableSlot undefined when the doctor has no slot", () => {
    const cards = buildDoctorCards([doc()], new Map());
    const item = cards?.kind === "doctor_cards" ? cards.items[0] : undefined;
    expect(item?.nextAvailableSlot).toBeUndefined();
    expect(item?.bookingHref).toBe("/booking/c1?staffId=s1");
  });

  it("maps each doctor's own slot (per-doctor) and mints distinct hrefs", () => {
    const cards = buildDoctorCards(
      [doc({ staffId: "s1" }), doc({ staffId: "s2" })],
      new Map([
        ["s1", { kind: "datetime", value: "2026-06-05T09:30" }],
        ["s2", { kind: "day", value: "2026-06-06" }],
      ]),
    );
    expect(hrefs(cards)).toEqual(["/booking/c1?staffId=s1", "/booking/c1?staffId=s2"]);
    if (cards?.kind === "doctor_cards") {
      expect(cards.items[0].nextAvailableSlot?.value).toBe("2026-06-05T09:30");
      expect(cards.items[1].nextAvailableSlot?.value).toBe("2026-06-06");
    }
  });
});
