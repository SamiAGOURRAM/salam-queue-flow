import { AlertTriangle, Calendar, CheckCircle, Clock, XCircle } from "lucide-react";
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

/**
 * End Day Confirmation Dialog
 * World-class ERP pattern inspired by Epic EpicCare day closure
 * 
 * Features:
 * - Multi-step confirmation with impact preview
 * - Visual warning system with critical colors
 * - Detailed summary of what will happen
 * - Reason/notes capture for audit trail
 * - Checkbox confirmation to prevent accidental clicks
 * - Full RPC integration with atomic transaction
 */
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

  // Load preview data when dialog opens
  const handleOpenChange = async (isOpen: boolean) => {
    if (isOpen) {
      // Reset state
      setStep('preview');
      setReason("");
      setNotes("");
      setUnderstood(false);
      
      // Fetch preview from RPC
      try {
        const { data, error } = await supabase.rpc('get_day_closure_preview', {
          p_staff_id: staffId,
          p_clinic_id: clinicId,
          p_closure_date: new Date().toISOString().split('T')[0],
        } as any);

        if (error) throw error;
        setPreview(data as unknown as ClosurePreview);
      } catch (error) {
        console.error('Failed to load preview:', error);
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
      const { data, error } = await supabase.rpc('end_day_for_staff', {
        p_staff_id: staffId,
        p_clinic_id: clinicId,
        p_closure_date: new Date().toISOString().split('T')[0],
        p_performed_by: userId,
        p_reason: reason || 'End of day closure',
        p_notes: notes || null,
      } as any);

      if (error) throw error;

      const result = data as any;
      toast({
        title: "✅ Day Closed Successfully",
        description: `${result?.summary?.markedNoShow || 0} marked no-show, ${result?.summary?.markedCompleted || 0} completed`,
        duration: 5000,
      });

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('End day failed:', error);
      toast({
        title: "❌ End Day Failed",
        description: error.message || "An unexpected error occurred",
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
      <AlertDialogContent className="max-w-2xl">
        {step === 'preview' ? (
          <>
            <AlertDialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="h-6 w-6 text-red-600" />
                </div>
                <div>
                  <AlertDialogTitle className="text-2xl text-red-900">
                    End Day - Critical Action
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-red-700">
                    This will close today's queue and update all appointments
                  </AlertDialogDescription>
                </div>
              </div>
            </AlertDialogHeader>

            <div className="space-y-4 py-4">
              {/* Warning Banner */}
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-900">
                    <p className="font-bold mb-1">⚠️ WARNING: This action will immediately:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Mark all <strong>waiting patients</strong> as <strong>NO-SHOW</strong></li>
                      <li>Mark all <strong>absent patients</strong> as <strong>NO-SHOW</strong></li>
                      <li>Mark current <strong>in-progress</strong> patient as <strong>COMPLETED</strong></li>
                      <li>Close the queue for today</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Impact Summary */}
              {preview && (
                <Card className="border-2 border-orange-200">
                  <CardContent className="pt-6">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                      <Calendar className="h-5 w-5 text-orange-600" />
                      Impact Summary for {new Date().toLocaleDateString()}
                    </h3>
                    
                    {preview.totalAppointments === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-gray-500 mb-2">No appointments for today</p>
                        <p className="text-sm text-gray-400">You can still close the day to mark it as completed</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                      {/* What will happen */}
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-orange-900 uppercase tracking-wide">Will Change:</p>
                        
                        {preview.willMarkNoShow > 0 && (
                          <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                            <div className="flex items-center gap-2">
                              <XCircle className="h-5 w-5 text-red-600" />
                              <span className="text-sm font-medium text-red-900">Mark NO-SHOW</span>
                            </div>
                            <span className="text-2xl font-bold text-red-600">{preview.willMarkNoShow}</span>
                          </div>
                        )}
                        
                        {preview.willMarkCompleted > 0 && (
                          <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-5 w-5 text-green-600" />
                              <span className="text-sm font-medium text-green-900">Mark COMPLETED</span>
                            </div>
                            <span className="text-2xl font-bold text-green-600">{preview.willMarkCompleted}</span>
                          </div>
                        )}

                        {preview.willMarkNoShow === 0 && preview.willMarkCompleted === 0 && (
                          <p className="text-sm text-gray-500 italic">No pending appointments to update</p>
                        )}
                      </div>

                      {/* Current state */}
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Current State:</p>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                            <span className="text-gray-700">Waiting</span>
                            <span className="font-mono font-bold">{preview.waiting}</span>
                          </div>
                          <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                            <span className="text-gray-700">In Progress</span>
                            <span className="font-mono font-bold">{preview.inProgress}</span>
                          </div>
                          <div className="flex justify-between items-center p-2 bg-gray-50 rounded">
                            <span className="text-gray-700">Absent</span>
                            <span className="font-mono font-bold">{preview.absent}</span>
                          </div>
                          <div className="flex justify-between items-center p-2 bg-green-50 rounded border border-green-200">
                            <span className="text-green-700 font-medium">Completed</span>
                            <span className="font-mono font-bold text-green-700">{preview.completed}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Total */}
                    <div className="mt-4 pt-4 border-t-2 border-gray-200">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-gray-900">Total Appointments Today:</span>
                        <span className="text-3xl font-bold text-gray-900">{preview.totalAppointments}</span>
                      </div>
                    </div>
                    </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Reason (optional) */}
              <div className="space-y-2">
                <Label htmlFor="reason" className="text-sm font-medium">
                  Reason (Optional)
                </Label>
                <Textarea
                  id="reason"
                  placeholder="e.g., End of working hours, Emergency closure, etc."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                onClick={() => setStep('confirm')}
                disabled={!hasActivePatients}
                className="bg-orange-600 hover:bg-orange-700"
              >
                Continue to Confirmation
              </Button>
            </AlertDialogFooter>
            
            {/* Info message when no patients to process */}
            {!hasActivePatients && (
              <div className="mt-2 -mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900 text-center">
                  ℹ️ <strong>End Day is not needed</strong> - There are no waiting, in-progress, or absent patients to finalize.
                  {preview && preview.completed > 0 && ` All ${preview.completed} patients have been completed.`}
                </p>
              </div>
            )}
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-12 w-12 rounded-full bg-red-500 flex items-center justify-center animate-pulse">
                  <AlertTriangle className="h-7 w-7 text-white" />
                </div>
                <div>
                  <AlertDialogTitle className="text-2xl text-red-900">
                    ⚠️ FINAL CONFIRMATION REQUIRED
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-red-700 font-medium">
                    You are about to close the day. This action is difficult to undo.
                  </AlertDialogDescription>
                </div>
              </div>
            </AlertDialogHeader>

            <div className="space-y-4 py-4">
              {/* Critical warning */}
              <div className="bg-gradient-to-r from-red-100 to-orange-100 border-2 border-red-400 rounded-lg p-5">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-red-700" />
                    <p className="font-bold text-red-900">This will happen IMMEDIATELY:</p>
                  </div>
                  <ul className="space-y-2 ml-7 text-sm text-red-900">
                    <li>• <strong>{preview?.willMarkNoShow || 0}</strong> patients will be marked <strong>NO-SHOW</strong></li>
                    <li>• <strong>{preview?.willMarkCompleted || 0}</strong> in-progress patients will be marked <strong>COMPLETED</strong></li>
                    <li>• The queue will be closed for today</li>
                    <li>• Patients will be notified of status changes</li>
                  </ul>
                </div>
              </div>

              {/* Additional notes */}
              <div className="space-y-2">
                <Label htmlFor="notes" className="text-sm font-medium">
                  Additional Notes (Optional)
                </Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional context or notes for the audit trail..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>

              {/* Confirmation checkbox */}
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="understand"
                    checked={understood}
                    onCheckedChange={(checked) => setUnderstood(checked as boolean)}
                    className="mt-1"
                  />
                  <Label
                    htmlFor="understand"
                    className="text-sm text-red-900 font-medium cursor-pointer leading-relaxed"
                  >
                    I understand that this will immediately close today's queue and update all pending appointments. 
                    This action creates an audit trail but should only be used at end of day or in emergencies.
                  </Label>
                </div>
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setStep('preview')}>
                ← Go Back
              </AlertDialogCancel>
              <Button
                onClick={handleEndDay}
                disabled={!understood || loading}
                className="bg-red-600 hover:bg-red-700 font-bold"
              >
                {loading ? (
                  <>
                    <Clock className="mr-2 h-4 w-4 animate-spin" />
                    Closing Day...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="mr-2 h-4 w-4" />
                    YES, END DAY NOW
                  </>
                )}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
