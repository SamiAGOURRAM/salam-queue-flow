export { AnalyticsRepository } from './repositories/AnalyticsRepository';
export {
  getKPIDashboard,
  getReferralAnalytics,
  getRangeBounds,
  getDateSequence,
  roundToOneDecimal,
  toLocalDateString,
  formatCurrency,
  computeSummary,
  normalizeDailyMetrics,
  RANGE_DAYS,
} from './AnalyticsService';

export type {
  RangeKey,
  AnalyticsSummary,
  DailyMetrics,
  RevenueWindowMetrics,
  RevenueKpis,
  KPIDashboardPayload,
  ReferralAnalytics,
} from './AnalyticsService';
