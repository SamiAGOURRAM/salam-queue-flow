import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarDays, FileClock, Loader2, ShieldCheck, Stethoscope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { medicalRecordSharingService, type SharedAppointmentDetail, type SharedAppointmentSummary } from '@/services/medical-records';
import { useTranslation } from 'react-i18next';

interface SharedRecordsPanelProps {
  grantId: string | null;
  patientName?: string;
  expiresAt?: Date | null;
  onClose: () => void;
  onExpired?: () => void;
}

function getRemaining(expiresAt: Date | null | undefined, nowMs: number) {
  if (!expiresAt) {
    return { isUnknown: true, isExpired: false, hours: 0, minutes: 0 };
  }

  const diffMs = expiresAt.getTime() - nowMs;
  if (diffMs <= 0) {
    return { isUnknown: false, isExpired: true, hours: 0, minutes: 0 };
  }

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return { isUnknown: false, isExpired: false, hours, minutes };
}

export function SharedRecordsPanel({ grantId, patientName, expiresAt, onClose, onExpired }: SharedRecordsPanelProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SharedAppointmentSummary[]>([]);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SharedAppointmentDetail | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;

    setNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, [expiresAt]);

  const remaining = useMemo(() => getRemaining(expiresAt, nowMs), [expiresAt, nowMs]);

  const expiresLabel = useMemo(() => {
    if (remaining.isUnknown) return t('medicalSharing.doctor.sharedRecords.expiryUnknown');
    if (remaining.isExpired) return t('medicalSharing.doctor.sharedRecords.expired');
    if (remaining.hours > 0) {
      return t('medicalSharing.doctor.sharedRecords.hourMinRemaining', {
        hours: remaining.hours,
        minutes: remaining.minutes,
      });
    }

    return t('medicalSharing.doctor.sharedRecords.minRemaining', {
      count: remaining.minutes,
    });
  }, [remaining, t]);

  useEffect(() => {
    if (!grantId) {
      setHistory([]);
      setDetail(null);
      setSelectedAppointmentId(null);
      setError(null);
      return;
    }

    const loadHistory = async () => {
      setLoading(true);
      setError(null);
      try {
        const items = await medicalRecordSharingService.getSharedHistory(grantId);
        setHistory(items);
      } catch (historyError) {
        const message =
          historyError instanceof Error
            ? historyError.message
            : t('medicalSharing.doctor.sharedRecords.errors.loadHistory');
        setError(message);
        if (message.toLowerCase().includes('expired')) {
          onExpired?.();
        }
      } finally {
        setLoading(false);
      }
    };

    void loadHistory();
  }, [grantId, onExpired]);

  const handleSelectAppointment = async (appointmentId: string) => {
    if (!grantId) return;

    setSelectedAppointmentId(appointmentId);
    setLoading(true);
    setError(null);
    try {
      const response = await medicalRecordSharingService.getSharedDetail(grantId, appointmentId);
      setDetail(response);
    } catch (detailError) {
      setError(
        detailError instanceof Error
          ? detailError.message
          : t('medicalSharing.doctor.sharedRecords.errors.loadDetail')
      );
    } finally {
      setLoading(false);
    }
  };

  if (!grantId) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            {t('medicalSharing.doctor.sharedRecords.title')}
          </p>
          <p className="text-xs text-muted-foreground">
            {patientName
              ? t('medicalSharing.doctor.sharedRecords.accessWithPatient', {
                  patientName,
                  expires: expiresLabel,
                })
              : t('medicalSharing.doctor.sharedRecords.accessWithoutPatient', {
                  expires: expiresLabel,
                })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              'text-xs',
              remaining.isExpired
                ? 'border-red-300 text-red-700 dark:border-red-800 dark:text-red-300'
                : 'border-emerald-300 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300'
            )}
          >
            <FileClock className="mr-1 h-3 w-3" />
            {remaining.isExpired
              ? t('medicalSharing.doctor.sharedRecords.accessExpired')
              : t('medicalSharing.doctor.sharedRecords.expiresIn', { expires: expiresLabel })}
          </Badge>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>

      <Separator className="my-3" />

      {loading && history.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t('medicalSharing.doctor.sharedRecords.loading')}
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </div>
      ) : history.length === 0 ? (
        <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          {t('medicalSharing.doctor.sharedRecords.empty')}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {history.map((item) => (
              <button
                key={item.appointmentId}
                type="button"
                className={cn(
                  'w-full rounded-md border p-3 text-left transition-colors',
                  selectedAppointmentId === item.appointmentId
                    ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
                    : 'border-border hover:bg-muted/40'
                )}
                onClick={() => handleSelectAppointment(item.appointmentId)}
              >
                <p className="text-sm font-medium text-foreground">{item.clinicName}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                  <CalendarDays className="h-3 w-3" />
                  {item.date}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{item.doctorName}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.hasDiagnoses && (
                    <Badge variant="secondary">{t('medicalSharing.doctor.sharedRecords.diagnosisBadge')}</Badge>
                  )}
                  {item.hasPrescriptions && (
                    <Badge variant="secondary">{t('medicalSharing.doctor.sharedRecords.prescriptionBadge')}</Badge>
                  )}
                  {item.hasLabResults && (
                    <Badge variant="secondary">{t('medicalSharing.doctor.sharedRecords.labsBadge')}</Badge>
                  )}
                  {item.hasProcedureReports && (
                    <Badge variant="secondary">{t('medicalSharing.doctor.sharedRecords.procedureReportsBadge')}</Badge>
                  )}
                  {item.hasNotes && <Badge variant="secondary">{t('medicalSharing.doctor.sharedRecords.notesBadge')}</Badge>}
                </div>
              </button>
            ))}
          </div>

          <div className="rounded-md border border-border bg-muted/20 p-4 min-h-[220px]">
            {!detail ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                {t('medicalSharing.doctor.sharedRecords.selectAppointment')}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{detail.appointmentType}</p>
                  <p className="text-xs text-muted-foreground">
                    {detail.date} · {detail.clinicName} · {detail.doctorName}
                  </p>
                </div>

                {detail.reasonForVisit && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t('medicalSharing.doctor.sharedRecords.reasonForVisit')}
                    </p>
                    <p className="text-sm text-foreground mt-1">{detail.reasonForVisit}</p>
                  </div>
                )}

                {detail.notes && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t('medicalSharing.doctor.sharedRecords.clinicalNotes')}
                    </p>
                    <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{detail.notes}</p>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t('medicalSharing.doctor.sharedRecords.diagnoses')}
                    </p>
                    {detail.diagnoses.length === 0 ? (
                      <p className="text-sm text-muted-foreground mt-1">
                        {t('medicalSharing.doctor.sharedRecords.noVisibleDiagnoses')}
                      </p>
                    ) : (
                      <ul className="mt-1 space-y-1 text-sm text-foreground">
                        {detail.diagnoses.map((diagnosis) => (
                          <li key={diagnosis.id} className="flex items-start gap-2">
                            <Stethoscope className="h-3.5 w-3.5 mt-0.5 text-emerald-600" />
                            <span>
                              {diagnosis.diagnosisLabel}
                              {diagnosis.diagnosisCode ? ` (${diagnosis.diagnosisCode})` : ''}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t('medicalSharing.doctor.sharedRecords.prescriptions')}
                    </p>
                    {detail.prescriptions.length === 0 ? (
                      <p className="text-sm text-muted-foreground mt-1">
                        {t('medicalSharing.doctor.sharedRecords.noVisiblePrescriptions')}
                      </p>
                    ) : (
                      <ul className="mt-1 space-y-1 text-sm text-foreground">
                        {detail.prescriptions.map((prescription) => (
                          <li key={prescription.id}>{prescription.medicationName}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t('medicalSharing.doctor.sharedRecords.labResults')}
                    </p>
                    {detail.labResults.length === 0 ? (
                      <p className="text-sm text-muted-foreground mt-1">
                        {t('medicalSharing.doctor.sharedRecords.noVisibleLabResults')}
                      </p>
                    ) : (
                      <ul className="mt-1 space-y-1 text-sm text-foreground">
                        {detail.labResults.map((lab) => (
                          <li key={lab.id}>
                            {lab.testName}
                            {lab.resultValue ? `: ${lab.resultValue}${lab.unit ? ` ${lab.unit}` : ''}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t('medicalSharing.doctor.sharedRecords.procedureReports')}
                    </p>
                    {detail.procedureReports.length === 0 ? (
                      <p className="text-sm text-muted-foreground mt-1">
                        {t('medicalSharing.doctor.sharedRecords.noVisibleProcedureReports')}
                      </p>
                    ) : (
                      <div className="mt-2 space-y-3">
                        {detail.procedureReports.map((report) => (
                          <div key={report.id} className="rounded-md border border-border bg-background/50 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-foreground">{report.title}</p>
                              <Badge variant="outline" className="capitalize">
                                {report.status.replace(/_/g, ' ')}
                              </Badge>
                            </div>

                            {report.contentPlainText && (
                              <p className="text-sm text-foreground/90 mt-2 whitespace-pre-wrap">{report.contentPlainText}</p>
                            )}

                            {report.images.length > 0 && (
                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                {report.images.map((image) => (
                                  <a
                                    key={image.id}
                                    href={image.signedUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-md border border-border bg-card p-2 transition-colors hover:bg-muted/40"
                                  >
                                    {image.signedUrl ? (
                                      <img
                                        src={image.signedUrl}
                                        alt={image.fileName}
                                        className="h-28 w-full rounded object-cover"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <div className="h-28 w-full rounded bg-muted" />
                                    )}
                                    <p className="mt-2 truncate text-xs text-muted-foreground">{image.fileName}</p>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
