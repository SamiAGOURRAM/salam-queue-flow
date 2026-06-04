import { describe, it, expect } from "vitest";
import { buildBookingHref, type BookingHrefParams } from "./cards";

// buildBookingHref returns a branded BookingHref; compare as a plain string.
const href = (p: BookingHrefParams): string => buildBookingHref(p);

describe("buildBookingHref", () => {
  it("builds a clinic-only link without a query string", () => {
    expect(href({ clinicId: "c1" })).toBe("/booking/c1");
  });

  it("appends staffId as a query param when provided", () => {
    expect(href({ clinicId: "c1", staffId: "s1" })).toBe("/booking/c1?staffId=s1");
  });

  it("percent-encodes special characters in both params", () => {
    expect(href({ clinicId: "a b", staffId: "x/y" })).toBe(
      "/booking/a%20b?staffId=x%2Fy",
    );
  });

  it("omits the query string for an empty staffId", () => {
    expect(href({ clinicId: "c1", staffId: "" })).toBe("/booking/c1");
  });
});
