import { describe, it, expect } from "vitest";
import { BookingService } from "./BookingService.js";

const noop = new Proxy({}, { get: () => () => {} }) as any;

type DayResult = { available: boolean; mode?: string | null; slots?: Array<{ time: string; available: boolean }> };

function makeService(slotsByDate: Record<string, DayResult>) {
  const repository = {
    getAvailableSlotsForMode: async (_clinicId: string, date: string): Promise<DayResult> =>
      slotsByDate[date] ?? { available: false, mode: "slotted", slots: [] },
  } as any;
  return new BookingService(repository, noop, noop);
}

describe("BookingService.getNextAvailableSlot", () => {
  it("returns the first available slotted slot on day 0", async () => {
    const svc = makeService({
      "2026-06-04": { available: true, mode: "slotted", slots: [
        { time: "09:00", available: false },
        { time: "09:30", available: true },
      ] },
    });
    expect(await svc.getNextAvailableSlot("c1", "2026-06-04")).toEqual({ kind: "datetime", value: "2026-06-04T09:30" });
  });

  it("scans forward to a later day when earlier days are full", async () => {
    const svc = makeService({
      "2026-06-04": { available: true, mode: "slotted", slots: [{ time: "09:00", available: false }] },
      "2026-06-05": { available: true, mode: "slotted", slots: [] },
      "2026-06-06": { available: true, mode: "slotted", slots: [{ time: "10:00", available: true }] },
    });
    expect(await svc.getNextAvailableSlot("c1", "2026-06-04")).toEqual({ kind: "datetime", value: "2026-06-06T10:00" });
  });

  it("returns a day-kind slot for a fluid day with capacity", async () => {
    const svc = makeService({ "2026-06-04": { available: true, mode: "fluid", slots: [] } });
    expect(await svc.getNextAvailableSlot("c1", "2026-06-04")).toEqual({ kind: "day", value: "2026-06-04" });
  });

  it("returns null when nothing is available within maxDays", async () => {
    const svc = makeService({}); // every day defaults to not-available, no slots
    expect(await svc.getNextAvailableSlot("c1", "2026-06-04", 3)).toBeNull();
  });

  it("respects the maxDays cap (does not scan beyond it)", async () => {
    let calls = 0;
    const repository = {
      getAvailableSlotsForMode: async () => { calls++; return { available: false, mode: "slotted", slots: [] }; },
    } as any;
    const svc = new BookingService(repository, noop, noop);
    await svc.getNextAvailableSlot("c1", "2026-06-04", 5);
    expect(calls).toBe(5);
  });
});
