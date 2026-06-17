import { describe, it, expect } from "vitest";
import { isDoctorLikeRole } from "./isDoctorLikeRole";

describe("isDoctorLikeRole", () => {
  it("accepts roles whose name contains 'doctor'", () => {
    expect(isDoctorLikeRole("doctor")).toBe(true);
    expect(isDoctorLikeRole("DOCTOR")).toBe(true);
    expect(isDoctorLikeRole("visiting_doctor")).toBe(true);
  });

  it("accepts known clinical roles", () => {
    expect(isDoctorLikeRole("dentist")).toBe(true);
    expect(isDoctorLikeRole("cardiologist")).toBe(true);
    expect(isDoctorLikeRole("Surgeon")).toBe(true);
  });

  it("rejects non-clinical roles regardless of specialization", () => {
    expect(isDoctorLikeRole("receptionist")).toBe(false);
    expect(isDoctorLikeRole("nurse")).toBe(false);
    expect(isDoctorLikeRole("clinic_owner")).toBe(false);
  });

  it("rejects empty/nullish roles", () => {
    expect(isDoctorLikeRole("")).toBe(false);
    expect(isDoctorLikeRole(null)).toBe(false);
    expect(isDoctorLikeRole(undefined)).toBe(false);
  });
});
