import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock3,
  UserX,
  Users,
  Wallet2,
} from "lucide-react";

import { useClinicPermissions } from "@/hooks/useClinicPermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { DoctorActivityCard } from "@/components/clinic/DoctorActivityCard";
import { useToast } from "@/hooks/use-toast";
import {
  getKPIDashboard,
  formatCurrency,
} from "@/services/analytics";
import type {
  RangeKey,
  AnalyticsSummary,
  DailyMetrics,
  RevenueKpis,
} from "@/services/analytics";

export default function ClinicAnalytics() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { clinic, loading: accessLoading, can } = useClinicPermissions();

  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const canViewBilling = can("view_billing");
  const [range, setRange] = useState<RangeKey>("30d");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<AnalyticsSummary>({
    totalAppointments: 0,
    completedAppointments: 0,
    noShowAppointments: 0,
    completionRate: 0,
    noShowRate: 0,
    avgDurationMinutes: 0,
    avgWaitMinutes: 0,
    activeStaffCount: 0,
  });
  const [dailyMetrics, setDailyMetrics] = useState<DailyMetrics[]>([]);
  const [revenueKpis, setRevenueKpis] = useState<RevenueKpis | null>(null);

  useEffect(() => {
    if (!clinic?.id || !can("view_analytics")) {
      return;
    }

    let cancelled = false;

    const loadAnalytics = async () => {
      setLoading(true);
      try {
        const payload = await getKPIDashboard(
          clinic.id,
          range,
          locale,
          canViewBilling,
        );

        if (cancelled) return;

        setDailyMetrics(payload.dailyMetrics);
        setRevenueKpis(payload.revenueKpis);
        setSummary(payload.summary);
      } catch (error) {
        if (cancelled) return;
        toast({
          title: t("clinicAnalytics.errors.loadTitle", "Could not load analytics"),
          description: error instanceof Error ? error.message : t("clinicAnalytics.errors.loadDescription", "Please try again."),
          variant: "destructive",
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadAnalytics();

    return () => {
      cancelled = true;
    };
  }, [clinic?.id, range, locale, canViewBilling, t, toast]);

  const chartConfig = useMemo(() => ({
    completed: {
      label: t("clinicAnalytics.chart.completed", "Completed"),
      color: "hsl(var(--teal))",
    },
    noShow: {
      label: t("clinicAnalytics.chart.noShow", "No-show"),
      color: "hsl(var(--coral))",
    },
    avgWait: {
      label: t("clinicAnalytics.chart.avgWait", "Avg wait"),
      color: "hsl(var(--primary))",
    },
  }), [t]);

  if (accessLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="border-border/40 shadow-sm">
        <CardContent className="p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("clinicAnalytics.subtitle", "Performance and outcomes")}
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-foreground flex items-center gap-2 mt-1">
              <BarChart3 className="w-5 h-5 text-primary" />
              {t("clinicAnalytics.title", "Clinic Analytics")}
            </h1>
          </div>
          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
            {(["7d", "30d", "90d"] as RangeKey[]).map((key) => (
              <Button
                key={key}
                variant={range === key ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => setRange(key)}
              >
                {t(`clinicAnalytics.range.${key}`, key === "7d" ? "7 days" : key === "30d" ? "30 days" : "90 days")}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/40 shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("clinicAnalytics.cards.total", "Appointments")}</p>
            <p className="text-3xl font-bold text-foreground mt-2">{summary.totalAppointments}</p>
          </CardContent>
        </Card>

        <Card className="border-border/40 shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("clinicAnalytics.cards.completionRate", "Completion rate")}</p>
            <p className="text-3xl font-bold text-foreground mt-2">{summary.completionRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">{summary.completedAppointments} {t("clinicAnalytics.cards.completedLabel", "completed")}</p>
          </CardContent>
        </Card>

        <Card className="border-border/40 shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("clinicAnalytics.cards.noShowRate", "No-show rate")}</p>
            <p className="text-3xl font-bold text-foreground mt-2">{summary.noShowRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">{summary.noShowAppointments} {t("clinicAnalytics.cards.noShowLabel", "no-show")}</p>
          </CardContent>
        </Card>

        <Card className="border-border/40 shadow-sm">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{t("clinicAnalytics.cards.activeStaff", "Active staff")}</p>
            <p className="text-3xl font-bold text-foreground mt-2">{summary.activeStaffCount}</p>
          </CardContent>
        </Card>
      </div>

      {canViewBilling && (
        <Card className="border-border/40 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Wallet2 className="w-4 h-4 text-primary" />
              {t("clinicAnalytics.billing.title", "Revenue and collection")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {revenueKpis ? (
              <>
                {([
                  { key: "day", label: t("clinicAnalytics.billing.day", "Today"), metrics: revenueKpis.day },
                  { key: "week", label: t("clinicAnalytics.billing.week", "Last 7 days"), metrics: revenueKpis.week },
                  { key: "month", label: t("clinicAnalytics.billing.month", "Month to date"), metrics: revenueKpis.month },
                ]).map((row) => (
                  <div key={row.key} className="rounded-[6px] border border-border/60 px-3 py-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{row.label}</p>
                      <p className="text-xs text-muted-foreground">{row.metrics.collectionRate}% {t("clinicAnalytics.billing.collectionRate", "collection")}</p>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">{t("clinicAnalytics.billing.billed", "Billed")}</p>
                        <p className="font-semibold text-foreground">
                          {formatCurrency(row.metrics.billed, revenueKpis.currency || "MAD", locale)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("clinicAnalytics.billing.collected", "Collected")}</p>
                        <p className="font-semibold text-foreground">
                          {formatCurrency(row.metrics.collected, revenueKpis.currency || "MAD", locale)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">{t("clinicAnalytics.billing.unpaid", "Unpaid")}</p>
                        <p className="font-semibold text-foreground">{row.metrics.unpaidCount}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                {loading
                  ? t("clinicAnalytics.billing.loading", "Loading billing metrics...")
                  : t("clinicAnalytics.billing.empty", "No billing metrics available yet.")}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/40 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal" />
              {t("clinicAnalytics.chart.volumeTitle", "Completed vs no-show trend")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <ChartContainer config={chartConfig} className="h-[220px] w-full">
              <AreaChart data={dailyMetrics} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="analyticsCompletedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--teal))" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(var(--teal))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="analyticsNoShowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--coral))" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(var(--coral))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.4} />
                <XAxis dataKey="dateLabel" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickMargin={10} interval="preserveStartEnd" />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickMargin={10} width={35} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="completed" stroke="hsl(var(--teal))" strokeWidth={2} fill="url(#analyticsCompletedGrad)" dot={false} />
                <Area type="monotone" dataKey="noShow" stroke="hsl(var(--coral))" strokeWidth={2} fill="url(#analyticsNoShowGrad)" dot={false} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="border-border/40 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock3 className="w-4 h-4 text-primary" />
              {t("clinicAnalytics.cards.timeSummary", "Time summary")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-[6px] border border-border/60 px-3 py-2">
              <div className="text-xs text-muted-foreground">{t("clinicAnalytics.cards.avgDuration", "Avg duration")}</div>
              <div className="font-semibold text-foreground">{summary.avgDurationMinutes} {t("clinicAnalytics.units.min", "min")}</div>
            </div>
            <div className="flex items-center justify-between rounded-[6px] border border-border/60 px-3 py-2">
              <div className="text-xs text-muted-foreground">{t("clinicAnalytics.cards.avgWait", "Avg wait")}</div>
              <div className="font-semibold text-foreground">{summary.avgWaitMinutes} {t("clinicAnalytics.units.min", "min")}</div>
            </div>
            <div className="flex items-center justify-between rounded-[6px] border border-border/60 px-3 py-2">
              <div className="text-xs text-muted-foreground">{t("clinicAnalytics.cards.activeStaff", "Active staff")}</div>
              <div className="font-semibold text-foreground">{summary.activeStaffCount}</div>
            </div>
            <Button variant="outline" className="w-full rounded-[6px]" onClick={() => navigate("/clinic/queue")}> 
              <Activity className="w-4 h-4 mr-2" />
              {t("clinicAnalytics.actions.openQueue", "Open live queue")}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/40 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            {t("clinicAnalytics.chart.waitTrendTitle", "Average wait trend")}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
            <AreaChart data={dailyMetrics} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="analyticsWaitGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.4} />
              <XAxis dataKey="dateLabel" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickMargin={10} interval="preserveStartEnd" />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickMargin={10} width={35} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area type="monotone" dataKey="avgWait" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#analyticsWaitGrad)" dot={false} />
            </AreaChart>
          </ChartContainer>
          {!loading && dailyMetrics.every((entry) => entry.avgWait === 0) && (
            <p className="text-xs text-muted-foreground mt-2">
              {t("clinicAnalytics.chart.waitFallback", "No queue snapshot wait-time data available for this range yet.")}
            </p>
          )}
        </CardContent>
      </Card>

      {can("view_analytics") && clinic?.id && <DoctorActivityCard clinicId={clinic.id} />}
    </div>
  );
}
