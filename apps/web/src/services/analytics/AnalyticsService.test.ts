import { describe, expect, it } from 'vitest';
import {
  computeSummary,
  normalizeDailyMetrics,
  getDateSequence,
  getRangeBounds,
  roundToOneDecimal,
  formatCurrency,
  toLocalDateString,
} from './AnalyticsService';
import type { DailyMetrics } from './AnalyticsService';

// ---- roundToOneDecimal ----

describe('roundToOneDecimal', () => {
  it('rounds to one decimal place', () => {
    expect(roundToOneDecimal(12.34)).toBe(12.3);
    expect(roundToOneDecimal(12.35)).toBe(12.4);
    expect(roundToOneDecimal(0)).toBe(0);
    expect(roundToOneDecimal(100)).toBe(100);
  });

  it('handles negative values', () => {
    expect(roundToOneDecimal(-12.34)).toBe(-12.3);
    // JS Math.round rounds -123.5 toward +inf => -123 => -12.3
    expect(roundToOneDecimal(-12.35)).toBe(-12.3);
    expect(roundToOneDecimal(-12.36)).toBe(-12.4);
  });
});

// ---- toLocalDateString ----

describe('toLocalDateString', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(toLocalDateString(new Date(2025, 5, 3))).toBe('2025-06-03');
    expect(toLocalDateString(new Date(2024, 0, 1))).toBe('2024-01-01');
    expect(toLocalDateString(new Date(2023, 11, 31))).toBe('2023-12-31');
  });
});

// ---- formatCurrency ----

describe('formatCurrency', () => {
  it('formats USD for en-US locale', () => {
    const result = formatCurrency(1234.56, 'USD', 'en-US');
    expect(result).toContain('1');
    expect(result).toContain('234');
    // Should produce something like "$1,234.56"
    expect(result).toMatch(/[\$,]/);
  });

  it('formats EUR for fr-FR locale', () => {
    const result = formatCurrency(99.9, 'EUR', 'fr-FR');
    expect(result).toContain('99');
  });

  it('falls back when Intl throws', () => {
    // Simulate a bad currency code — Intl may throw; fallback format used
    const result = formatCurrency(50, 'BAD_CODE', 'en-US');
    expect(result).toContain('50');
    expect(result).toContain('BAD_CODE');
  });
});

// ---- getRangeBounds ----

describe('getRangeBounds', () => {
  it('produces string bounds for 7d range', () => {
    const { from, to, fromDate, toDate } = getRangeBounds('7d');

    // toDate should be today
    const today = new Date();
    expect(toDate.getFullYear()).toBe(today.getFullYear());
    expect(toDate.getMonth()).toBe(today.getMonth());
    expect(toDate.getDate()).toBe(today.getDate());

    // fromDate should be 6 days before today (7d inclusive)
    const expectedFrom = new Date(today);
    expectedFrom.setDate(today.getDate() - 6);
    expect(fromDate.getFullYear()).toBe(expectedFrom.getFullYear());
    expect(fromDate.getMonth()).toBe(expectedFrom.getMonth());
    expect(fromDate.getDate()).toBe(expectedFrom.getDate());

    // String representations should match
    expect(from).toBe(toLocalDateString(fromDate));
    expect(to).toBe(toLocalDateString(toDate));
  });

  it('produces string bounds for 30d range', () => {
    const { from, to, fromDate, toDate } = getRangeBounds('30d');

    const today = new Date();
    expect(toDate.getDate()).toBe(today.getDate());
    expect(from).toBe(toLocalDateString(fromDate));
    expect(to).toBe(toLocalDateString(toDate));
  });

  it('produces string bounds for 90d range', () => {
    const { from, to } = getRangeBounds('90d');
    expect(from).toBeTruthy();
    expect(to).toBeTruthy();
    // 90d inclusive -> 89 days diff
    const fromParts = from.split('-').map(Number);
    const toParts = to.split('-').map(Number);
    const fromDate = new Date(fromParts[0], fromParts[1] - 1, fromParts[2]);
    const toDate = new Date(toParts[0], toParts[1] - 1, toParts[2]);
    const diffMs = toDate.getTime() - fromDate.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(89);
  });
});

// ---- getDateSequence ----

describe('getDateSequence', () => {
  it('generates correct number of entries for a date range', () => {
    const from = new Date(2025, 5, 1);
    const to = new Date(2025, 5, 7);
    const rows = getDateSequence(from, to, 'en-US');
    expect(rows).toHaveLength(7);
  });

  it('each entry has correct structure', () => {
    const from = new Date(2025, 5, 1);
    const to = new Date(2025, 5, 1);
    const rows = getDateSequence(from, to, 'en-US');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dateKey: '2025-06-01',
      total: 0,
      completed: 0,
      noShow: 0,
      avgWait: 0,
      durationCount: 0,
      durationSum: 0,
      waitSamples: 0,
      waitSum: 0,
    });
  });

  it('uses locale for date labels', () => {
    const from = new Date(2025, 5, 1);
    const to = new Date(2025, 5, 1);
    const en = getDateSequence(from, to, 'en-US');
    const fr = getDateSequence(from, to, 'fr-FR');
    // Same date, different locale formatting
    expect(en[0].dateLabel).toBeTruthy();
    expect(fr[0].dateLabel).toBeTruthy();
  });
});

// ---- normalizeDailyMetrics ----

describe('normalizeDailyMetrics', () => {
  it('computes avgWait from waitSum / waitSamples', () => {
    const input: DailyMetrics[] = [
      {
        dateKey: '2025-06-01',
        dateLabel: 'Jun 1',
        total: 10,
        completed: 8,
        noShow: 1,
        avgWait: 0,
        durationCount: 8,
        durationSum: 240,
        waitSamples: 5,
        waitSum: 75,
      },
    ];
    const result = normalizeDailyMetrics(input);
    // 75 / 5 = 15
    expect(result[0].avgWait).toBe(15);
  });

  it('yields 0 avgWait when no samples exist', () => {
    const input: DailyMetrics[] = [
      {
        dateKey: '2025-06-02',
        dateLabel: 'Jun 2',
        total: 0,
        completed: 0,
        noShow: 0,
        avgWait: 0,
        durationCount: 0,
        durationSum: 0,
        waitSamples: 0,
        waitSum: 0,
      },
    ];
    const result = normalizeDailyMetrics(input);
    expect(result[0].avgWait).toBe(0);
  });

  it('rounds avgWait to one decimal', () => {
    const input: DailyMetrics[] = [
      {
        dateKey: '2025-06-03',
        dateLabel: 'Jun 3',
        total: 5,
        completed: 3,
        noShow: 1,
        avgWait: 0,
        durationCount: 3,
        durationSum: 90,
        waitSamples: 3,
        waitSum: 34.56, // 34.56 / 3 = 11.52 -> rounds to 11.5
      },
    ];
    const result = normalizeDailyMetrics(input);
    expect(result[0].avgWait).toBe(11.5);
  });
});

// ---- computeSummary ----

describe('computeSummary', () => {
  const sampleMetrics: DailyMetrics[] = [
    {
      dateKey: '2025-06-01',
      dateLabel: 'Jun 1',
      total: 10,
      completed: 8,
      noShow: 1,
      avgWait: 12,
      durationCount: 8,
      durationSum: 240,
      waitSamples: 8,
      waitSum: 96,
    },
    {
      dateKey: '2025-06-02',
      dateLabel: 'Jun 2',
      total: 10,
      completed: 7,
      noShow: 2,
      avgWait: 15,
      durationCount: 7,
      durationSum: 210,
      waitSamples: 7,
      waitSum: 105,
    },
  ];

  it('aggregates totals from daily metrics', () => {
    const result = computeSummary(sampleMetrics, 4);
    expect(result.totalAppointments).toBe(20);
    expect(result.completedAppointments).toBe(15);
    expect(result.noShowAppointments).toBe(3);
    expect(result.activeStaffCount).toBe(4);
  });

  it('computes correct completion rate', () => {
    const result = computeSummary(sampleMetrics, 0);
    // 15 / 20 * 100 = 75
    expect(result.completionRate).toBe(75);
  });

  it('computes correct no-show rate', () => {
    const result = computeSummary(sampleMetrics, 0);
    // 3 / 20 * 100 = 15
    expect(result.noShowRate).toBe(15);
  });

  it('computes average duration', () => {
    const result = computeSummary(sampleMetrics, 0);
    // (240 + 210) / (8 + 7) = 450 / 15 = 30
    expect(result.avgDurationMinutes).toBe(30);
  });

  it('computes average wait time', () => {
    const result = computeSummary(sampleMetrics, 0);
    // (96 + 105) / (8 + 7) = 201 / 15 = 13.4
    expect(result.avgWaitMinutes).toBe(13.4);
  });

  it('rounds rates to one decimal', () => {
    // 1 out of 3 = 33.333... -> rounds to 33.3
    const edge: DailyMetrics[] = [{
      dateKey: '2025-06-01',
      dateLabel: 'Jun 1',
      total: 3,
      completed: 1,
      noShow: 0,
      avgWait: 0,
      durationCount: 1,
      durationSum: 10,
      waitSamples: 1,
      waitSum: 5,
    }];
    const result = computeSummary(edge, 0);
    expect(result.completionRate).toBe(33.3);
  });

  it('handles empty metrics array', () => {
    const result = computeSummary([], 0);
    expect(result.totalAppointments).toBe(0);
    expect(result.completedAppointments).toBe(0);
    expect(result.completionRate).toBe(0);
    expect(result.noShowRate).toBe(0);
    expect(result.avgDurationMinutes).toBe(0);
    expect(result.avgWaitMinutes).toBe(0);
    expect(result.activeStaffCount).toBe(0);
  });

  it('handles zero totals (division safety)', () => {
    const allZero: DailyMetrics[] = [{
      dateKey: '2025-06-01',
      dateLabel: 'Jun 1',
      total: 0,
      completed: 0,
      noShow: 0,
      avgWait: 0,
      durationCount: 0,
      durationSum: 0,
      waitSamples: 0,
      waitSum: 0,
    }];
    const result = computeSummary(allZero, 0);
    expect(result.completionRate).toBe(0);
    expect(result.noShowRate).toBe(0);
    expect(result.avgDurationMinutes).toBe(0);
    expect(result.avgWaitMinutes).toBe(0);
  });
});
