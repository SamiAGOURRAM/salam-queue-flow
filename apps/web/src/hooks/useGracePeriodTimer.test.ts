import { describe, expect, it } from "vitest";
import { formatGraceCountdown, resolveGraceCountdown } from "./useGracePeriodTimer";

describe("formatGraceCountdown", () => {
  it("formats minute and second values", () => {
    expect(formatGraceCountdown(125_000)).toBe("2m 05s");
  });

  it("formats hour values", () => {
    expect(formatGraceCountdown(3_750_000)).toBe("1h 02m");
  });

  it("returns seconds when under one minute", () => {
    expect(formatGraceCountdown(9_000)).toBe("9s");
  });
});

describe("resolveGraceCountdown", () => {
  it("returns expiring urgency inside the final two minutes", () => {
    const nowMs = Date.UTC(2026, 0, 1, 10, 0, 0);
    const result = resolveGraceCountdown(new Date(nowMs + 90_000), nowMs);

    expect(result).not.toBeNull();
    expect(result?.isExpired).toBe(false);
    expect(result?.urgency).toBe("expiring");
    expect(result?.label).toBe("1m 30s");
  });

  it("returns expired urgency when deadline has passed", () => {
    const nowMs = Date.UTC(2026, 0, 1, 10, 0, 0);
    const result = resolveGraceCountdown(new Date(nowMs - 1_000), nowMs);

    expect(result).not.toBeNull();
    expect(result?.isExpired).toBe(true);
    expect(result?.urgency).toBe("expired");
    expect(result?.label).toBe("Expired");
  });

  it("returns null when deadline is invalid", () => {
    const nowMs = Date.UTC(2026, 0, 1, 10, 0, 0);
    expect(resolveGraceCountdown("not-a-date", nowMs)).toBeNull();
  });
});