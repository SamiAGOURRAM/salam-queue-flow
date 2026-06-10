import { AlertTriangle, Calendar, CheckCircle, ChevronRight, Clock, XCircle } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { logger } from "@/services/shared/logging/Logger";
import { cn } from "@/lib/utils";

interface EndDaySummaryResult {
  summary?: {
    markedNoShow?: number;
    markedCompleted?: number;
  };
}

interface EndDayConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  staffId: string;
  userId: string;
  onSuccess: () => void;
  summary: {
    waiting: number;
    inProgress: number;
    absent: number;
    completed: number;
  };
}

interface ClosurePreview {
  totalAppointments: number;
  waiting: number;
  inProgress: number;
  absent: number;
  completed: number;
  alreadyNoShow: number;
  willMarkNoShow: number;
  willMarkCompleted: number;
}

interface ClosureHistoryReport {
  id: string;
  clinicId: string;
  staffId: string;
  staffName: string | null;
  closureDate: string;
  closedAt: string;
  reason: string | null;
  notes: string | null;
  summary: {
    totalAppointments: number;
    waiting: number;
    inProgress: number;
    absent: number;
    completed: number;
    alreadyNoShow: number;
    markedNoShow: number;
    markedCompleted: number;
  };
}

function formatClosureDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function formatClosureTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export function EndDayConfirmationDialog({
  open,
  onOpenChange,
  clinicId,
  staffId,
  userId,
  onSuccess,
  summary,
}: EndDayConfirmationDialogProps) {
  const [step, setStep] = useState<'preview' | 'confirm'>('preview');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ClosurePreview | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyReports, setHistoryReports] = useState<ClosureHistoryReport[]>([]);
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const rpcClient = supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
  };

  const loadClosureHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data, error } = await rpcClient.rpc('get_day_closure_history', {
        p_clinic_id: clinicId,
        p_staff_id: null,
        p_limit: 8,
        p_offset: 0,
      });

      if (error) throw error;

      setHistoryReports(Array.isArray(data) ? (data as ClosureHistoryReport[]) : []);
    } catch (error) {
      logger.warn('Failed to load day closure history', {
        clinicId,
        staffId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      setHistoryReports([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Load preview data when dialog opens
  const handleOpenChange = async (isOpen: boolean) => {
    if (isOpen) {
      // Reset state
      setStep('preview');
      setReason("");
      setNotes("");
      setUnderstood(false);
      setExpandedReportId(null);
      setHistoryReports([]);
      
      // Fetch preview from RPC
      try {
        const { data, error } = await rpcClient.rpc('get_day_closure_preview', {
          p_staff_id: staffId,
          p_clinic_id: clinicId,
          p_closure_date: new Date().toISOString().split('T')[0],
        });

        if (error) throw error;
        setPreview((data as unknown as ClosurePreview) ?? null);
        void loadClosureHistory();
      } catch (error) {
        logger.error('Failed to load preview', error instanceof Error ? error : new Error(String(error)), { clinicId, staffId });
        toast({
          title: "Error",
          description: "Failed to load day closure preview",
          variant: "destructive",
        });
        onOpenChange(false);
        return;
      }
    }
    onOpenChange(isOpen);
  };

  const handleEndDay = async () => {
    if (!understood) {
      toast({
        title: "Confirmation Required",
        description: "Please confirm that you understand this action cannot be undone easily",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await rpcClient.rpc('end_day_for_staff', {
        p_staff_id: staffId,
        p_clinic_id: clinicId,
        p_closure_date: new Date().toISOString().split('T')[0],
        p_performed_by: userId,
        p_reason: reason || 'End of day closure',
        p_notes: notes || null,
      });

      if (error) throw error;

      const result = (data as (EndDaySummaryResult & { reportId?: string }) | null) ?? {};
      toast({
        title: "✅ Day Closed Successfully",
        description: `${result?.summary?.markedNoShow || 0} marked no-show, ${result?.summary?.markedCompleted || 0} completed${result?.reportId ? '. Report saved.' : ''}`,
        duration: 5000,
      });

      onOpenChange(false);
      onSuccess();
    } catch (error: unknown) {
      logger.error('End day failed', error instanceof Error ? error : new Error(String(error)), { clinicId, staffId, userId });
      const description =
        error instanceof Error ? error.message : "Failed to summarize the day";
      toast({
        title: "❌ End Day Failed",
        description,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Only allow end day if there are active patients to process
  const hasActivePatients = summary.waiting > 0 || summary.inProgress > 0 || summary.absent > 0;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-xl rounded-[8px] p-0 gap-0">
        {step === 'preview' ? (
          <>
            {/* Premium Header */}
            <div className="p-6 border-b border-border">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-[4px] bg-amber-500 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <AlertDialogTitle className="text-lg font-semibold tracking-tight">End Day</AlertDialogTitle>
                  <AlertDialogDescription className="text-sm text-muted-foreground mt-0.5">
                    Close today's queue and finalize appointments
                  </AlertDialogDescription>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Warning Banner */}
              <div className="bg-amber-50 border border-amber-200 rounded-[4px] p-4">
                <p className="text-xs font-medium text-amber-800 uppercase tracking-wider mb-2">This action will:</p>
                <ul className="space-y-1.5 text-sm text-amber-900">
                  <li className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-amber-600" />
                    Mark waiting & absent patients as <strong>NO-SHOW</strong>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-amber-600" />
                    Mark in-progress patients as <strong>COMPLETED</strong>
                  </li>
                  <li className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-600" />
                    Close the queue for today
                  </li>
                </ul>
              </div>

              {/* Impact Summary */}
              {preview && preview.totalAppointments > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Impact Summary</p>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Changes */}
                    <div className="space-y-2">
                      {preview.willMarkNoShow > 0 && (
                        <div className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-[4px]">
                          <span className="text-sm text-red-800">No-Show</span>
                          <span className="text-xl font-bold text-red-600">{preview.willMarkNoShow}</span>
                        </div>
                      )}
                      {preview.willMarkCompleted > 0 && (
                        <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-100 rounded-[4px]">
                          <span className="text-sm text-emerald-800">Completed</span>
                          <span className="text-xl font-bold text-emerald-600">{preview.willMarkCompleted}</span>
                        </div>
                      )}
                    </div>
                    {/* Current State */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 bg-muted/50 rounded-[4px]">
                        <span className="text-sm text-muted-foreground">Waiting</span>
                        <span className="font-medium">{preview.waiting}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-muted/50 rounded-[4px]">
                        <span className="text-sm text-muted-foreground">In Progress</span>
                        <span className="font-medium">{preview.inProgress}</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-muted/50 rounded-[4px]">
                        <span className="text-sm text-muted-foreground">Absent</span>
                        <span className="font-medium">{preview.absent}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {preview && preview.totalAppointments === 0 && (
                <div className="text-center py-6 text-muted-foreground">
                  <p>No appointments for today</p>
                  <p className="text-sm">You can still close the day to mark it as completed</p>
                </div>
              )}

              {/* Reason */}
              <div className="space-y-1.5">
                <Label htmlFor="reason" className="text-xs text-muted-foreground">Reason (Optional)</Label>
                <Textarea
                  id="reason"
                  placeholder="e.g., End of working hours"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="min-h-[60px] rounded-[4px] border-border/60 resize-none"
                />
              </div>

              {/* Recent reports */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent Closure Reports</p>
                {historyLoading ? (
                  <div className="rounded-[4px] border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                    Loading recent reports...
                  </div>
                ) : historyReports.length === 0 ? (
                  <div className="rounded-[4px] border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    No closure reports recorded yet.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {historyReports.map((report) => {
                      const isExpanded = expandedReportId === report.id;
                      return (
                        <Card key={report.id} className="border-border/60 shadow-none">
                          <CardContent className="p-3">
                            <button
                              type="button"
                              onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
                              className="w-full text-left"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium text-foreground">
                                    {formatClosureDate(report.closureDate)}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {(report.staffName || 'Staff')} · {formatClosureTimestamp(report.closedAt)}
                                  </p>
                                </div>
                                <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
                              </div>
                              <p className="text-xs text-muted-foreground mt-2">
                                {report.summary.markedNoShow} no-show · {report.summary.markedCompleted} completed
                              </p>
                            </button>

                            {isExpanded && (
                              <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div className="flex items-center justify-between rounded-[4px] bg-muted/50 px-2 py-1.5">
                                    <span className="text-muted-foreground">Total</span>
                                    <span className="font-medium text-foreground">{report.summary.totalAppointments}</span>
                                  </div>
                                  <div className="flex items-center justify-between rounded-[4px] bg-muted/50 px-2 py-1.5">
                                    <span className="text-muted-foreground">Waiting</span>
                                    <span className="font-medium text-foreground">{report.summary.waiting}</span>
                                  </div>
                                  <div className="flex items-center justify-between rounded-[4px] bg-muted/50 px-2 py-1.5">
                                    <span className="text-muted-foreground">In Progress</span>
                                    <span className="font-medium text-foreground">{report.summary.inProgress}</span>
                                  </div>
                                  <div className="flex items-center justify-between rounded-[4px] bg-muted/50 px-2 py-1.5">
                                    <span className="text-muted-foreground">Absent</span>
                                    <span className="font-medium text-foreground">{report.summary.absent}</span>
                                  </div>
                                  <div className="flex items-center justify-between rounded-[4px] bg-muted/50 px-2 py-1.5">
                                    <span className="text-muted-foreground">Completed</span>
                                    <span className="font-medium text-foreground">{report.summary.completed}</span>
                                  </div>
                                  <div className="flex items-center justify-between rounded-[4px] bg-muted/50 px-2 py-1.5">
                                    <span className="text-muted-foreground">Already No-Show</span>
                                    <span className="font-medium text-foreground">{report.summary.alreadyNoShow}</span>
                                  </div>
                                </div>

                                {(report.reason || report.notes) && (
                                  <div className="space-y-1 text-xs text-muted-foreground">
                                    {report.reason && (
                                      <p>
                                        <span className="font-medium text-foreground">Reason:</span> {report.reason}
                                      </p>
                                    )}
                                    {report.notes && (
                                      <p>
                                        <span className="font-medium text-foreground">Notes:</span> {report.notes}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Info when no patients */}
              {!hasActivePatients && (
                <div className="bg-blue-50 border border-blue-100 rounded-[4px] p-3 text-center">
                  <p className="text-sm text-blue-800">
                    No pending appointments to finalize.
                    {preview && preview.completed > 0 && ` All ${preview.completed} patients completed.`}
                  </p>
                </div>
              )}
            </div>

            <AlertDialogFooter className="p-6 pt-0">
              <AlertDialogCancel className="rounded-[4px]">Cancel</AlertDialogCancel>
              <Button
                onClick={() => setStep('confirm')}
                disabled={!hasActivePatients}
                className="rounded-[4px] bg-amber-600 hover:bg-amber-700 text-white"
              >
                Continue
              </Button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            {/* Confirm Header */}
            <div className="p-6 border-b border-border bg-red-50">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-[4px] bg-red-600 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <AlertDialogTitle className="text-lg font-semibold tracking-tight text-red-900">Final Confirmation</AlertDialogTitle>
                  <AlertDialogDescription className="text-sm text-red-700 mt-0.5">
                    This action cannot be easily undone
                  </AlertDialogDescription>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Summary */}
              <div className="bg-red-50 border border-red-200 rounded-[4px] p-4 space-y-2">
                <p className="text-sm font-medium text-red-900">This will happen immediately:</p>
                <ul className="space-y-1 text-sm text-red-800">
                  <li>• {preview?.willMarkNoShow || 0} patients → NO-SHOW</li>
                  <li>• {preview?.willMarkCompleted || 0} patients → COMPLETED</li>
                  <li>• Queue will be closed</li>
                </ul>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-xs text-muted-foreground">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional context for audit trail..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[60px] rounded-[4px] border-border/60 resize-none"
                />
              </div>

              {/* Confirmation */}
              <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-[4px]">
                <Checkbox
                  id="understand"
                  checked={understood}
                  onCheckedChange={(checked) => setUnderstood(checked as boolean)}
                  className="mt-0.5"
                />
                <Label htmlFor="understand" className="text-sm text-foreground cursor-pointer leading-relaxed">
                  I understand this will close today's queue and update all pending appointments.
                </Label>
              </div>
            </div>

            <AlertDialogFooter className="p-6 pt-0">
              <AlertDialogCancel onClick={() => setStep('preview')} className="rounded-[4px]">
                Back
              </AlertDialogCancel>
              <Button
                onClick={handleEndDay}
                disabled={!understood || loading}
                className="rounded-[4px] bg-red-600 hover:bg-red-700 text-white"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Closing...
                  </span>
                ) : (
                  "End Day Now"
                )}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
