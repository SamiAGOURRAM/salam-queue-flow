import { supabase } from '@/integrations/supabase/client';

// ---- Exported types ----

export interface ReferralAnalytics {
  totalReferrals: number;
  pendingReferrals: number;
  acceptedReferrals: number;
  declinedReferrals: number;
  completedReferrals: number;
  cancelledReferrals: number;
  conversionRate: number;
}

export type RangeKey = "7d" | "30d" | "90d";

export interface AnalyticsSummary {
  totalAppointments: number;
  completedAppointments: number;
  noShowAppointments: number;
  completionRate: number;
  noShowRate: number;
  avgDurationMinutes: number;
  avgWaitMinutes: number;
  activeStaffCount: number;
}

export interface DailyMetrics {
  dateKey: string;
  dateLabel: string;
  total: number;
  completed: number;
  noShow: number;
  avgWait: number;
  durationCount: number;
  durationSum: number;
  waitSamples: number;
  waitSum: number;
}

export interface RevenueWindowMetrics {
  billed: number;
  collected: number;
  collectionRate: number;
  completedCount: number;
  paidCount: number;
  unpaidCount: number;
}

export interface RevenueKpis {
  currency: string;
  day: RevenueWindowMetrics;
  week: RevenueWindowMetrics;
  month: RevenueWindowMetrics;
}

export interface KPIDashboardPayload {
  summary: AnalyticsSummary;
  dailyMetrics: DailyMetrics[];
  revenueKpis: RevenueKpis | null;
  computedFrom: string;
  computedTo: string;
}

// ---- Range helpers ----

export const RANGE_DAYS: Record<RangeKey, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getRangeBounds(range: RangeKey): {
  fromDate: Date;
  toDate: Date;
  from: string;
  to: string;
} {
  const toDate = new Date();
  toDate.setHours(0, 0, 0, 0);

  const fromDate = new Date(toDate);
  fromDate.setDate(toDate.getDate() - (RANGE_DAYS[range] - 1));

  return {
    fromDate,
    toDate,
    from: toLocalDateString(fromDate),
    to: toLocalDateString(toDate),
  };
}

export function getDateSequence(fromDate: Date, toDate: Date, locale: string): DailyMetrics[] {
  const rows: DailyMetrics[] = [];
  const cursor = new Date(fromDate);
  const end = new Date(toDate);

  while (cursor <= end) {
    const dateKey = toLocalDateString(cursor);
    rows.push({
      dateKey,
      dateLabel: new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(cursor),
      total: 0,
      completed: 0,
      noShow: 0,
      avgWait: 0,
      durationCount: 0,
      durationSum: 0,
      waitSamples: 0,
      waitSum: 0,
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return rows;
}

export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatCurrency(value: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

// ---- KPI aggregation ----

/**
 * Compute an AnalyticsSummary from raw daily metrics.
 * Pure function — no side effects, no service calls.
 */
export function computeSummary(dailyMetrics: DailyMetrics[], activeStaffCount: number): AnalyticsSummary {
  let totalAppointments = 0;
  let completedAppointments = 0;
  let noShowAppointments = 0;
  let durationCount = 0;
  let durationSum = 0;
  let waitSampleCount = 0;
  let waitSampleSum = 0;

  for (const row of dailyMetrics) {
    totalAppointments += row.total;
    completedAppointments += row.completed;
    noShowAppointments += row.noShow;
    durationCount += row.durationCount;
    durationSum += row.durationSum;
    waitSampleCount += row.waitSamples;
    waitSampleSum += row.waitSum;
  }

  const completionRate = totalAppointments > 0 ? (completedAppointments / totalAppointments) * 100 : 0;
  const noShowRate = totalAppointments > 0 ? (noShowAppointments / totalAppointments) * 100 : 0;
  const avgDurationMinutes = durationCount > 0 ? durationSum / durationCount : 0;
  const avgWaitMinutes = waitSampleCount > 0 ? waitSampleSum / waitSampleCount : 0;

  return {
    totalAppointments,
    completedAppointments,
    noShowAppointments,
    completionRate: roundToOneDecimal(completionRate),
    noShowRate: roundToOneDecimal(noShowRate),
    avgDurationMinutes: roundToOneDecimal(avgDurationMinutes),
    avgWaitMinutes: roundToOneDecimal(avgWaitMinutes),
    activeStaffCount,
  };
}

/**
 * Normalise daily metrics by computing per-row avgWait.
 */
export function normalizeDailyMetrics(sequence: DailyMetrics[]): DailyMetrics[] {
  return sequence.map((row) => ({
    ...row,
    avgWait: row.waitSamples > 0 ? roundToOneDecimal(row.waitSum / row.waitSamples) : 0,
  }));
}

// ---- Analytics service ----

/**
 * Aggregates KPI data from multiple Supabase sources into a single payload.
 * Used by both the analytics page and dashboard for consistent rendering.
 */
export async function getKPIDashboard(
  clinicId: string,
  range: RangeKey,
  locale: string,
  canViewBilling: boolean,
): Promise<KPIDashboardPayload> {
  const { fromDate, toDate, from, to } = getRangeBounds(range);

  const revenueKpisPromise = canViewBilling
    ? supabase.rpc("get_clinic_revenue_kpis", {
        p_clinic_id: clinicId,
      })
    : Promise.resolve<{ data: null; error: null }>({ data: null, error: null });

  const [appointmentsResult, snapshotsResult, realtimeMetricsResult, revenueKpisResult] =
    await Promise.all([
      supabase
        .from("appointments")
        .select("appointment_date, status, actual_duration")
        .eq("clinic_id", clinicId)
        .gte("appointment_date", from)
        .lte("appointment_date", to),
      supabase
        .from("queue_snapshots")
        .select("snapshot_date, average_wait_time")
        .eq("clinic_id", clinicId)
        .gte("snapshot_date", from)
        .lte("snapshot_date", to)
        .order("snapshot_date", { ascending: true }),
      supabase.rpc("get_clinic_realtime_metrics", {
        p_clinic_id: clinicId,
      }),
      revenueKpisPromise,
    ]);

  if (appointmentsResult.error) throw appointmentsResult.error;
  if (snapshotsResult.error) throw snapshotsResult.error;
  if (realtimeMetricsResult.error) throw realtimeMetricsResult.error;
  if (revenueKpisResult.error) throw revenueKpisResult.error;

  const sequence = getDateSequence(fromDate, toDate, locale);
  const dailyByDate = new Map(sequence.map((row) => [row.dateKey, row]));

  for (const appointment of appointmentsResult.data ?? []) {
    const row = dailyByDate.get(appointment.appointment_date);
    if (!row) continue;

    row.total += 1;

    if (appointment.status === "completed") {
      row.completed += 1;
    }

    if (appointment.status === "no_show") {
      row.noShow += 1;
    }

    if (typeof appointment.actual_duration === "number" && appointment.actual_duration > 0) {
      row.durationCount += 1;
      row.durationSum += appointment.actual_duration;
    }
  }

  for (const snapshot of snapshotsResult.data ?? []) {
    if (typeof snapshot.average_wait_time !== "number" || snapshot.average_wait_time < 0) {
      continue;
    }

    const row = dailyByDate.get(snapshot.snapshot_date);
    if (!row) continue;

    row.waitSamples += 1;
    row.waitSum += snapshot.average_wait_time;
  }

  const normalizedDaily = normalizeDailyMetrics(sequence);

  const realtimeMetrics = (realtimeMetricsResult.data ?? {}) as {
    active_staff_count?: number;
  };

  const summary = computeSummary(normalizedDaily, Number(realtimeMetrics.active_staff_count ?? 0));

  const revenueKpis = canViewBilling && revenueKpisResult.data
    ? (revenueKpisResult.data as unknown as RevenueKpis)
    : null;

  return {
    summary,
    dailyMetrics: normalizedDaily,
    revenueKpis,
    computedFrom: from,
    computedTo: to,
  };
}

// ---- Referral analytics ----

export async function getReferralAnalytics(
  clinicId: string,
  from?: string,
  to?: string,
): Promise<ReferralAnalytics> {
  let query = supabase
    .from("patient_referrals")
    .select("id, status, created_at")
    .eq("clinic_id", clinicId);

  if (from) {
    query = query.gte("created_at", from);
  }
  if (to) {
    query = query.lte("created_at", to);
  }

  const { data, error } = await query;

  if (error) throw error;

  const referrals = (data ?? []) as Array<{ id: string; status: string }>;
  const total = referrals.length;
  const pending = referrals.filter((r) => r.status === "pending").length;
  const accepted = referrals.filter((r) => r.status === "accepted").length;
  const declined = referrals.filter((r) => r.status === "declined").length;
  const completed = referrals.filter((r) => r.status === "completed").length;
  const cancelled = referrals.filter((r) => r.status === "cancelled").length;
  const responded = accepted + declined;
  const conversionRate = responded > 0 ? Math.round((accepted / responded) * 1000) / 1000 : 0;

  return {
    totalReferrals: total,
    pendingReferrals: pending,
    acceptedReferrals: accepted,
    declinedReferrals: declined,
    completedReferrals: completed,
    cancelledReferrals: cancelled,
    conversionRate: roundToOneDecimal(conversionRate * 100),
  };
}
