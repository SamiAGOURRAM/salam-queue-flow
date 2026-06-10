import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, Clock, ShieldAlert, UserX, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

type RangeKey = 'today' | 'week' | 'month';

interface DoctorActivityCardProps {
  clinicId: string;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getRange(range: RangeKey): { from: string; to: string } {
  const today = new Date();
  const to = new Date(today);
  const from = new Date(today);
  if (range === 'week') {
    from.setDate(today.getDate() - 6);
  } else if (range === 'month') {
    from.setDate(today.getDate() - 29);
  }
  return { from: formatDate(from), to: formatDate(to) };
}

export function DoctorActivityCard({ clinicId }: DoctorActivityCardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [range, setRange] = useState<RangeKey>('today');
  const [rows, setRows] = useState<Array<{
    staff_id: string;
    doctor_name: string;
    specialization: string | null;
    completed_count: number;
    in_progress_count: number;
    cancelled_count: number;
    no_show_count: number;
    avg_duration_minutes: number | null;
    total_patients: number;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const { from, to } = getRange(range);

    setLoading(true);
    setPermissionDenied(false);
    (async () => {
      const { data, error } = await supabase.rpc('get_doctor_activity_report', {
        p_clinic_id: clinicId,
        p_from_date: from,
        p_to_date: to,
      });

      if (cancelled) return;

      if (error) {
        // 42501 = permission denied (raised by the server-side RPC)
        if ((error as { code?: string }).code === '42501') {
          setPermissionDenied(true);
          setRows([]);
        } else {
          toast({
            title: t('doctorActivity.errors.loadTitle', 'Could not load doctor activity'),
            description: error.message,
            variant: 'destructive',
          });
          setRows([]);
        }
      } else {
        setPermissionDenied(false);
        setRows((data ?? []) as Array<{
          staff_id: string;
          doctor_name: string;
          specialization: string | null;
          completed_count: number;
          in_progress_count: number;
          cancelled_count: number;
          no_show_count: number;
          avg_duration_minutes: number | null;
          total_patients: number;
        }>);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [clinicId, range, t, toast]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.completed += r.completed_count;
        acc.inProgress += r.in_progress_count;
        acc.cancelled += r.cancelled_count;
        acc.noShow += r.no_show_count;
        return acc;
      },
      { completed: 0, inProgress: 0, cancelled: 0, noShow: 0 }
    );
  }, [rows]);

  return (
    <Card className="border-border/40 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" />
            {t('doctorActivity.title', 'Doctor activity')}
          </CardTitle>
          {!permissionDenied && rows.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('doctorActivity.summary', {
                completed: totals.completed,
                noShow: totals.noShow,
                defaultValue: '{{completed}} completed · {{noShow}} no-shows',
              })}
            </p>
          )}
        </div>
        <div className="flex gap-1 rounded-md border border-border/60 p-0.5">
          {(['today', 'week', 'month'] as RangeKey[]).map((key) => (
            <Button
              key={key}
              size="sm"
              variant={range === key ? 'secondary' : 'ghost'}
              onClick={() => setRange(key)}
              className="h-7 px-2 text-xs"
            >
              {t(`doctorActivity.range.${key}`, key === 'today' ? 'Today' : key === 'week' ? '7 days' : '30 days')}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t('common.loading', 'Loading...')}
          </div>
        ) : permissionDenied ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <ShieldAlert className="h-8 w-8 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              {t('doctorActivity.errors.permissionDenied', 'You do not have permission to view doctor activity.')}
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {t('doctorActivity.empty', 'No doctor activity in this range yet.')}
          </div>
        ) : (
          <div className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">{t('doctorActivity.columns.doctor', 'Doctor')}</th>
                  <th className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Users className="h-3 w-3" />
                      {t('doctorActivity.columns.completed', 'Seen')}
                    </div>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Clock className="h-3 w-3" />
                      {t('doctorActivity.columns.avgDuration', 'Avg')}
                    </div>
                  </th>
                  <th className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <UserX className="h-3 w-3" />
                      {t('doctorActivity.columns.noShow', 'No-shows')}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.staff_id} className="border-t border-border/40">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-foreground">{row.doctor_name}</div>
                      {row.specialization && (
                        <div className="text-xs text-muted-foreground">{row.specialization}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-foreground">
                      {row.completed_count}
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">
                      {row.avg_duration_minutes != null
                        ? t('doctorActivity.minutes', {
                            value: Number(row.avg_duration_minutes).toFixed(0),
                            defaultValue: '{{value}} min',
                          })
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right text-muted-foreground">
                      {row.no_show_count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
