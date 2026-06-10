import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { queueService } from "@/services/queue";
import type { PublicQueueStatus } from "@/services/queue";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Calendar, Building2, RefreshCcw, Users, AlertCircle } from "lucide-react";
import { logger } from "@/services/shared/logging/Logger";

function resolveLocale(language: string): string {
  const normalized = language.split("-")[0];
  if (normalized === "fr") return "fr-FR";
  if (normalized === "ar") return "ar-MA";
  return "en-US";
}

function formatAppointmentDate(dateString: string | null, locale: string, fallbackLabel: string): string {
  if (!dateString) return fallbackLabel;

  const parsed = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return dateString;

  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function formatDisplayTime(timeOrDate: string | null, locale: string, fallbackLabel: string): string {
  if (!timeOrDate) return fallbackLabel;

  if (timeOrDate.includes("T")) {
    const parsed = new Date(timeOrDate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString(locale, {
        hour: "numeric",
        minute: "2-digit",
      });
    }
  }

  const [hours, minutes] = timeOrDate.split(":");
  const h = Number(hours);
  const m = Number(minutes);
  if (Number.isNaN(h) || Number.isNaN(m)) return timeOrDate;

  const normalized = new Date();
  normalized.setHours(h, m, 0, 0);
  return normalized.toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}

const activeStatuses = new Set(["scheduled", "waiting", "in_progress"]);

export default function PublicQueueStatus() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [queueInfo, setQueueInfo] = useState<PublicQueueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const locale = useMemo(
    () => resolveLocale(i18n.resolvedLanguage || i18n.language || "en"),
    [i18n.language, i18n.resolvedLanguage],
  );

  const statusConfig = useMemo(() => {
    const status = queueInfo?.status;
    const configs: Record<string, { label: string; className: string }> = {
      scheduled: { label: t('publicQueueStatus.status.scheduled'), className: "bg-muted text-foreground" },
      waiting: { label: t('publicQueueStatus.status.waiting'), className: "bg-amber-100 text-amber-800" },
      in_progress: { label: t('publicQueueStatus.status.inProgress'), className: "bg-emerald-100 text-emerald-800" },
      completed: { label: t('publicQueueStatus.status.completed'), className: "bg-muted text-muted-foreground" },
      cancelled: { label: t('publicQueueStatus.status.cancelled'), className: "bg-muted text-muted-foreground" },
      no_show: { label: t('publicQueueStatus.status.noShow'), className: "bg-red-100 text-red-800" },
    };

    if (!status) {
      return { label: t('publicQueueStatus.status.unknown'), className: "bg-muted text-muted-foreground" };
    }

    return configs[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  }, [queueInfo?.status, t]);

  const fetchPublicQueueStatus = useCallback(async () => {
    if (!token) {
      setLoadError(t('publicQueueStatus.errors.missingToken'));
      setLoading(false);
      return;
    }

    try {
      const status = await queueService.getPublicQueueStatus(token);

      if (!status) {
        setQueueInfo(null);
        setLoadError(t('publicQueueStatus.errors.invalidLink'));
        return;
      }

      setQueueInfo(status);
      setLoadError(null);
    } catch (error) {
      logger.error(
        "Failed to fetch public queue status",
        error instanceof Error ? error : new Error(String(error)),
        { tokenLength: token.length },
      );
      setLoadError(t('publicQueueStatus.errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    fetchPublicQueueStatus();
  }, [fetchPublicQueueStatus]);

  useEffect(() => {
    if (!queueInfo || !activeStatuses.has(queueInfo.status)) {
      return;
    }

    const interval = setInterval(() => {
      fetchPublicQueueStatus();
    }, 20000);

    return () => {
      clearInterval(interval);
    };
  }, [queueInfo, fetchPublicQueueStatus]);

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-10">
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-foreground border-t-transparent mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">{t('publicQueueStatus.loading')}</p>
        </div>
      </div>
    );
  }

  if (!queueInfo) {
    return (
      <div className="max-w-md mx-auto px-4 py-10">
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-semibold mb-2">{t('publicQueueStatus.unavailableTitle')}</h1>
          <p className="text-sm text-muted-foreground mb-6">{loadError ?? t('publicQueueStatus.errors.linkExpired')}</p>
          <Button onClick={() => navigate("/")} className="rounded-full px-6">
            {t('publicQueueStatus.backToHome')}
          </Button>
        </div>
      </div>
    );
  }

  const displayTime = formatDisplayTime(
    queueInfo.predictedStartTime ?? queueInfo.scheduledTime,
    locale,
    t('publicQueueStatus.calculating'),
  );
  const appointmentDate = formatAppointmentDate(
    queueInfo.appointmentDate,
    locale,
    t('publicQueueStatus.notAvailable'),
  );
  const lastUpdated = queueInfo.updatedAt
    ? new Date(queueInfo.updatedAt).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
    : t('publicQueueStatus.justNow');
  const appointmentTypeLabel = t(`appointments.type.${queueInfo.appointmentType}`, {
    defaultValue: queueInfo.appointmentType.replace(/_/g, " "),
  });

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <div className="rounded-3xl border border-border bg-card p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-muted-foreground">{t('publicQueueStatus.liveStatus')}</div>
          <Badge className={statusConfig.className}>{statusConfig.label}</Badge>
        </div>

        <div className="text-center bg-foreground text-background rounded-2xl p-6 mb-6">
          <p className="text-sm text-background/70 mb-1">{t('publicQueueStatus.currentPosition')}</p>
          <p className="text-6xl font-bold mb-2">#{queueInfo.queuePosition}</p>
          <p className="text-xs text-background/70">{t('publicQueueStatus.autoRefresh')}</p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-border p-3">
            <Building2 className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">{t('publicQueueStatus.clinic')}</p>
              <p className="font-medium">{queueInfo.clinicName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border p-3">
            <Clock className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">{t('publicQueueStatus.estimatedTime')}</p>
              <p className="font-medium">{displayTime}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border p-3">
            <Calendar className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">{t('publicQueueStatus.appointmentDate')}</p>
              <p className="font-medium">{appointmentDate}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border p-3">
            <Users className="w-5 h-5 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">{t('publicQueueStatus.visitType')}</p>
              <p className="font-medium capitalize">{appointmentTypeLabel}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{t('publicQueueStatus.updatedAt', { time: lastUpdated })}</p>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={fetchPublicQueueStatus}
        >
          <RefreshCcw className="w-4 h-4 mr-2" />
          {t('publicQueueStatus.refresh')}
        </Button>
      </div>
    </div>
  );
}
