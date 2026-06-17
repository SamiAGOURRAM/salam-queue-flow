import { describe, it, expect } from "vitest";
import { ClinicRepository } from "./ClinicRepository.js";

const noop = new Proxy({}, { get: () => () => {} }) as any;

/**
 * Minimal chainable Supabase mock: every builder method returns the same
 * thenable, which resolves to the canned rows for that table. Query filters
 * (eq/ilike/in) are no-ops — the join/filter logic under test runs in JS after
 * the fetch, so these tests exercise that logic with fixed inputs.
 */
function makeClient(tables: Record<string, unknown[]>) {
  const chainFor = (table: string) => {
    const result = { data: tables[table] ?? [], error: null };
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      ilike: () => chain,
      in: () => chain,
      limit: () => chain,
      then: (resolve: (r: unknown) => unknown) => resolve(result),
    };
    return chain;
  };
  // Repositories now receive SupabaseClient directly (no getClient() wrapper)
  return { from: chainFor } as any;
}

const repo = (tables: Record<string, unknown[]>) => new ClinicRepository(makeClient(tables), noop);
const clinics = [{ id: "c1", name: "Casa Family Care", specialty: "Dermatologie", city: "Casablanca" }];

describe("ClinicRepository.searchDoctors", () => {
  it("includes doctor-like roles and excludes non-clinical staff", async () => {
    const r = repo({
      clinics,
      clinic_staff: [
        { id: "s1", clinic_id: "c1", user_id: "u1", role: "doctor", specialization: null },
        { id: "s2", clinic_id: "c1", user_id: "u2", role: "receptionist", specialization: null },
        { id: "s3", clinic_id: "c1", user_id: "u3", role: "nurse", specialization: "Cardiology" },
        { id: "s4", clinic_id: "c1", user_id: "u4", role: "dentist", specialization: null },
      ],
      profiles: [
        { id: "u1", full_name: "Dr. Amina" },
        { id: "u2", full_name: "Front Desk" },
        { id: "u3", full_name: "Nurse Karim" },
        { id: "u4", full_name: "Dr. Sami" },
      ],
    });
    const docs = await r.searchDoctors({});
    // Role-based: doctor (s1) and the clinical-allowlist role dentist (s4) are kept.
    // A receptionist (s2) AND a nurse with a free-text specialization (s3) are both excluded.
    expect(docs.map((d) => d.staffId).sort()).toEqual(["s1", "s4"]);
  });

  it("maps clinic + profile fields onto the listing", async () => {
    const r = repo({
      clinics,
      clinic_staff: [{ id: "s1", clinic_id: "c1", user_id: "u1", role: "doctor", specialization: "Dermatology" }],
      profiles: [{ id: "u1", full_name: "Dr. Amina" }],
    });
    const [doc] = await r.searchDoctors({});
    expect(doc).toEqual({
      staffId: "s1",
      clinicId: "c1",
      fullName: "Dr. Amina",
      role: "doctor",
      specialization: "Dermatology",
      clinicName: "Casa Family Care",
      clinicSpecialty: "Dermatologie",
      city: "Casablanca",
    });
  });

  it("filters by provider name (case-insensitive)", async () => {
    const r = repo({
      clinics,
      clinic_staff: [
        { id: "s1", clinic_id: "c1", user_id: "u1", role: "doctor", specialization: null },
        { id: "s2", clinic_id: "c1", user_id: "u2", role: "doctor", specialization: null },
      ],
      profiles: [{ id: "u1", full_name: "Dr. Amina" }, { id: "u2", full_name: "Dr. Youssef" }],
    });
    const docs = await r.searchDoctors({ name: "amina" });
    expect(docs.map((d) => d.fullName)).toEqual(["Dr. Amina"]);
  });

  it("respects the limit", async () => {
    const r = repo({
      clinics,
      clinic_staff: [
        { id: "s1", clinic_id: "c1", user_id: "u1", role: "doctor", specialization: null },
        { id: "s2", clinic_id: "c1", user_id: "u2", role: "doctor", specialization: null },
      ],
      profiles: [{ id: "u1", full_name: "A" }, { id: "u2", full_name: "B" }],
    });
    expect((await r.searchDoctors({ limit: 1 })).length).toBe(1);
  });

  it("returns [] when there are no active clinics", async () => {
    const r = repo({ clinics: [], clinic_staff: [], profiles: [] });
    expect(await r.searchDoctors({})).toEqual([]);
  });
});
