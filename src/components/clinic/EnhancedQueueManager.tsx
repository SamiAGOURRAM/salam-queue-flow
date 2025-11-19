/**
 * Enhanced Queue Manager (Final, Definitive, Fully Functional Version)
 * This version contains the final UI logic fix for the "Call Next" button,
 * completing the entire queue management workflow.
 */
import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserX, Clock, AlertCircle, ChevronRight, Users, CheckCircle, RefreshCw, Play, UserCheck, AlertTriangle, Calendar, List } from "lucide-react";
import { useQueueService } from "@/hooks/useQueueService";
import { AppointmentStatus, QueueEntry, SkipReason } from "@/services/queue";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { logger } from "@/services/shared/logging/Logger";
import { SlottedQueueView } from "./SlottedQueueView";
import { OrdinalQueueList } from "./OrdinalQueueList";
import { QueueRepository } from "@/services/queue/repositories/QueueRepository";
import { QueueService } from "@/services/queue/QueueService";
import { QueueStrategyFactory } from "@/services/queue/strategies/QueueStrategy";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookAppointmentDialog } from "./BookAppointmentDialog";
import { waitlistService } from "@/services/queue/WaitlistService";
import { useToast } from "@/hooks/use-toast";

interface EnhancedQueueManagerProps {
  clinicId: string;
  userId: string;
  staffId: string;
  onSummaryChange?: (summary: { waiting: number; inProgress: number; absent: number; completed: number }) => void;
}

type WorkingDayRange = {
  start: Date;
  end: Date;
};

export function EnhancedQueueManager({ clinicId, userId, staffId, onSummaryChange }: EnhancedQueueManagerProps) {
  const [actionLoading, setActionLoading] = useState(false);
  const [clinicConfig, setClinicConfig] = useState<{ gracePeriodMinutes: number; allowWaitlist: boolean; workingDay?: WorkingDayRange | null } | null>(null);
  const [rebookDialog, setRebookDialog] = useState<{ open: boolean; patient: QueueEntry | null }>({ open: false, patient: null });

  // Destructure all necessary functions from the hook
  const { 
    isLoading, error, schedule, queueMode, refreshQueue, callNextPatient, 
    markPatientAbsent, completeAppointment, checkInPatient,
    markPatientPresent, markPatientNotPresent, resolveAbsentAppointment
  } = useQueueService({
    staffId: staffId,
    autoRefresh: true,
  });
  const { toast } = useToast();

  const computeWorkingDayRange = (settings?: Record<string, unknown> | null): WorkingDayRange | null => {
    if (!settings) return null;
    const workingHours = (settings as any)?.working_hours || (settings as any)?.workingHours;
    if (!workingHours) return null;
    const today = new Date();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = dayNames[today.getDay()];
    const daySchedule = workingHours[dayKey];
    if (!daySchedule || daySchedule.closed) return null;

    const openTime = daySchedule.open || '09:00';
    const closeTime = daySchedule.close || '18:00';
    const [openHour, openMinute] = openTime.split(':').map(Number);
    const [closeHour, closeMinute] = closeTime.split(':').map(Number);

    const start = new Date(today);
    start.setHours(openHour ?? 9, openMinute ?? 0, 0, 0);
    const end = new Date(today);
    end.setHours(closeHour ?? 18, closeMinute ?? 0, 0, 0);
    if (end <= start) return null;
    return { start, end };
  };

  // Fetch clinic config (grace_period_minutes, etc.)
  useEffect(() => {
    const fetchClinicConfig = async () => {
      try {
        const repository = new QueueRepository();
        const config = await repository.getClinicQueueConfigByStaffId(staffId);
        if (config) {
          setClinicConfig({ 
            gracePeriodMinutes: config.gracePeriodMinutes, 
            allowWaitlist: config.allowOverflow,
            workingDay: computeWorkingDayRange(config.settings),
          });
        } else {
          setClinicConfig({ gracePeriodMinutes: 15, allowWaitlist: false, workingDay: null });
        }
      } catch (error) {
        logger.warn('Failed to fetch clinic config', error as Error);
        setClinicConfig({ gracePeriodMinutes: 15, allowWaitlist: false, workingDay: null });
      }
    };
    if (staffId) {
      fetchClinicConfig();
    }
  }, [staffId]);

  // Determine if we should show slotted view (fixed/hybrid) or queue view (fluid)
  const isSlottedMode = queueMode === 'fixed' || queueMode === 'hybrid';

  // Derived state logic - includes all scheduled appointments for today (even future ones)
  const { currentPatient, waitingPatients, absentPatients, summary } = useMemo(() => {
    if (!schedule) return { currentPatient: null, waitingPatients: [], absentPatients: [], summary: { waiting: 0, inProgress: 0, absent: 0, completed: 0 } };
    const current = schedule.find(p => p.status === AppointmentStatus.IN_PROGRESS);
    
    // Include all scheduled/waiting appointments for today (even if time hasn't arrived yet)
    // Exclude: absent patients (they're in a separate list)
    const waiting = schedule.filter(p => 
      (p.status === AppointmentStatus.WAITING || p.status === AppointmentStatus.SCHEDULED) && 
      p.skipReason !== SkipReason.PATIENT_ABSENT
    );
    
    const absent = schedule.filter(p => p.skipReason === SkipReason.PATIENT_ABSENT && !p.returnedAt);
    return { 
      currentPatient: current, 
      waitingPatients: waiting, 
      absentPatients: absent, 
      summary: { waiting: waiting.length, inProgress: current ? 1 : 0, absent: absent.length, completed: schedule.filter(p => p.status === AppointmentStatus.COMPLETED).length }
    };
  }, [schedule]);

  // Notify parent of summary changes
  useEffect(() => {
    if (onSummaryChange) {
      onSummaryChange(summary);
    }
  }, [summary, onSummaryChange]);

  // Action handlers are all correct
  const handleAction = async (action: Promise<unknown>) => {
    setActionLoading(true);
    try { await action; } 
    catch (error) { 
      logger.error("Queue action failed", error instanceof Error ? error : new Error(String(error)), { clinicId, staffId }); 
    } 
    finally { setActionLoading(false); }
  };
  const [nonPresentDialog, setNonPresentDialog] = useState<{ open: boolean; patient: QueueEntry | null }>({ open: false, patient: null });
  const [queueService] = useState(() => new QueueService());

  const handleNextPatient = async () => {
    setActionLoading(true);
    try {
      await callNextPatient({ clinicId, staffId, date: new Date(), performedBy: userId, skipAbsentPatients: true });
    } catch (error) {
      const err = error as Error;
      // Check if error is about patient not being present
      if (err.message.includes('not physically present')) {
        // Find the next patient who would be called
        const scheduleData = await queueService.getDailySchedule(staffId, new Date().toISOString().split('T')[0]);
        const strategy = QueueStrategyFactory.getStrategy(scheduleData.queue_mode as any);
        const nextPatient = await strategy.getNextPatient(scheduleData.schedule, {
          currentTime: new Date(),
          clinicId: clinicId,
          staffId: staffId,
        });
        if (nextPatient) {
          setNonPresentDialog({ open: true, patient: nextPatient });
        } else {
          logger.error("Failed to call next patient", err, { clinicId, staffId });
        }
      } else {
        logger.error("Failed to call next patient", err, { clinicId, staffId });
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkAbsent = (appointmentId: string) => {
    setNonPresentDialog({ open: false, patient: null });
    handleAction(markPatientAbsent({ appointmentId, performedBy: userId, reason: 'Patient not present' }));
  };
  const handleCompleteAppointment = () => { if (currentPatient) handleAction(completeAppointment(currentPatient.id, userId)); };
  const handleCheckIn = (appointmentId: string) => handleAction(checkInPatient(appointmentId, userId));
  const handleMarkPresent = (appointmentId: string) => {
    setNonPresentDialog({ open: false, patient: null });
    handleAction(markPatientPresent(appointmentId, userId));
  };
  const handleMarkNotPresent = (appointmentId: string) => handleAction(markPatientNotPresent(appointmentId, userId));

  const handleOpenRebook = (patient: QueueEntry) => {
    setRebookDialog({ open: true, patient });
  };

  const handleRebookSuccess = async () => {
    if (rebookDialog.patient) {
      await resolveAbsentAppointment(rebookDialog.patient.id, userId, 'rebooked');
    }
    setRebookDialog({ open: false, patient: null });
  };

  const handleAddToWaitlist = async (patient: QueueEntry) => {
    setActionLoading(true);
    try {
      const targetDate = patient.startTime ? new Date(patient.startTime) : new Date();
      await waitlistService.addToWaitlist(
        clinicId,
        targetDate,
        patient.patientId || undefined,
        patient.guestPatientId || undefined,
        100,
        `Late return for ${patient.patient?.fullName || 'patient'}`
      );
      await resolveAbsentAppointment(patient.id, userId, 'waitlist');
      toast({
        title: "Added to waitlist",
        description: `${patient.patient?.fullName || 'Patient'} was added to today's waitlist.`,
      });
    } catch (error) {
      logger.error('Failed to add patient to waitlist', error instanceof Error ? error : new Error(String(error)), { patientId: patient.id });
      toast({
        title: "Failed to add to waitlist",
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Utility functions remain the same
  const formatWaitTime = (entry: QueueEntry) => !entry.checkedInAt ? "Not checked in" : formatDistanceToNow(new Date(entry.checkedInAt), { addSuffix: true });
  const getInitials = (name?: string) => !name ? "?" : name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const getPositionDisplay = (pos?: number | null) => !pos && pos !== 0 ? "—" : pos.toString().padStart(3, '0');

  // Loading and Error states are correct
  if (isLoading && schedule.length === 0) return <div className="flex items-center justify-center p-16"><RefreshCw className="h-10 w-10 animate-spin text-primary" /><p className="ml-4">Loading Schedule...</p></div>;
  if (error) return <Card className="border-destructive/50 bg-destructive/5"><CardHeader><CardTitle className="text-destructive flex items-center gap-2"><AlertCircle/>Error</CardTitle><CardDescription>{error.message}</CardDescription></CardHeader><CardContent><Button onClick={refreshQueue}>Retry</Button></CardContent></Card>;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-600">Waiting</p><p className="text-3xl font-bold text-orange-600">{summary.waiting}</p></div><Users className="h-10 w-10 text-orange-200" /></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-600">In Progress</p><p className="text-3xl font-bold text-green-600">{summary.inProgress}</p></div><Play className="h-10 w-10 text-green-200" /></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-600">Absent</p><p className="text-3xl font-bold text-red-600">{summary.absent}</p></div><UserX className="h-10 w-10 text-red-200" /></div></CardContent></Card>
          <Card><CardContent className="pt-6"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-600">Completed</p><p className="text-3xl font-bold text-slate-600">{summary.completed}</p></div><CheckCircle className="h-10 w-10 text-slate-200" /></div></CardContent></Card>
        </div>

        {/* Main Content - 2 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Current Patient */}
            {currentPatient ? (
              <Card className="border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50">
                <CardHeader><div className="flex items-center justify-between"><CardTitle className="text-lg text-green-900">Currently Serving</CardTitle><Badge className="bg-green-600 text-white"><Play className="h-3 w-3 mr-1" />In Progress</Badge></div></CardHeader>
                <CardContent><div className="flex items-center gap-4 mb-4"><Avatar className="h-16 w-16 border-4 border-white shadow-lg"><AvatarFallback className="bg-gradient-to-br from-green-400 to-emerald-500 text-white text-xl font-bold">{getInitials(currentPatient.patient?.fullName)}</AvatarFallback></Avatar><div className="flex-1"><h3 className="text-2xl font-bold text-green-900">{currentPatient.patient?.fullName || 'Patient'}</h3><p className="text-green-700">Position #{getPositionDisplay(currentPatient.queuePosition)}</p><p className="text-sm text-green-600 flex items-center gap-1 mt-1"><Clock className="h-3 w-3" />{formatWaitTime(currentPatient)}</p></div></div><div className="grid grid-cols-2 gap-3 text-sm text-green-900 mb-4"><div><p className="text-green-700 text-xs">Phone</p><p className="font-mono">{currentPatient.patient?.phoneNumber || 'N/A'}</p></div><div><p className="text-green-700 text-xs">Email</p><p className="truncate">{currentPatient.patient?.email || 'N/A'}</p></div></div><Button onClick={handleCompleteAppointment} disabled={actionLoading} size="lg" className="w-full bg-green-600 hover:bg-green-700"><CheckCircle className="mr-2 h-5 w-5" />Complete Appointment</Button></CardContent>
              </Card>
            ) : (
              <Card><CardContent className="py-16 text-center"><div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4"><Users className="h-8 w-8 text-slate-300" /></div><p className="text-slate-600 font-medium">No patient being served</p><p className="text-sm text-slate-500 mt-1">Call next patient to start</p></CardContent></Card>
            )}

            {/* Waiting Queue - Switch between Slotted and Queue View */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {isSlottedMode ? (
                        <>
                          <Calendar className="h-5 w-5 text-blue-600" />
                          Time Slots
                        </>
                      ) : (
                        <>
                          <List className="h-5 w-5 text-orange-600" />
                          Waiting Queue
                        </>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {isSlottedMode 
                        ? `${summary.waiting} scheduled appointment${summary.waiting !== 1 ? 's' : ''}`
                        : `${summary.waiting} patient${summary.waiting !== 1 ? 's' : ''} waiting`
                      }
                    </CardDescription>
                  </div>
                  {/* Call Next Button - Show if there are waiting patients */}
                  {waitingPatients.length > 0 && (
                    <Button 
                      onClick={handleNextPatient} 
                      disabled={
                        actionLoading || 
                        !!currentPatient || 
                        (isSlottedMode && waitingPatients.filter(p => p.isPresent || (p.startTime && new Date(p.startTime) <= new Date())).length === 0)
                      } 
                      size="lg"
                      title={
                        currentPatient 
                          ? "Complete current appointment first"
                          : waitingPatients.filter(p => p.isPresent || (p.startTime && new Date(p.startTime) <= new Date())).length === 0
                          ? "No patients present or ready"
                          : "Call next patient"
                      }
                    >
                      <ChevronRight className="mr-2 h-5 w-5" />Call Next
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isSlottedMode ? (
                  // Slotted View (Fixed/Hybrid)
                  <SlottedQueueView
                    schedule={schedule}
                    currentPatient={currentPatient}
                    onCheckIn={handleCheckIn}
                    onMarkAbsent={handleMarkAbsent}
                    onMarkPresent={handleMarkPresent}
                    onMarkNotPresent={handleMarkNotPresent}
                    actionLoading={actionLoading}
                    gracePeriodMinutes={clinicConfig?.gracePeriodMinutes}
                    workingDayStart={clinicConfig?.workingDay?.start}
                    workingDayEnd={clinicConfig?.workingDay?.end}
                  />
                ) : (
                  // Queue View (Fluid)
                  <OrdinalQueueList
                    patients={waitingPatients}
                    currentPatient={currentPatient}
                    onMarkAbsent={handleMarkAbsent}
                    loading={actionLoading}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Absent Patients */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <Card className={cn("border-2 transition-all", absentPatients.length > 0 ? "border-red-300 shadow-md" : "border-slate-200")}>
              <CardHeader className={cn("pb-4", absentPatients.length > 0 ? "bg-red-50/50" : "bg-slate-50/50")}><div className="flex items-center justify-between"><div className="flex items-center gap-2"><div className={cn("h-10 w-10 rounded-full flex items-center justify-center", absentPatients.length > 0 ? "bg-red-100" : "bg-slate-100")}><UserX className={cn("h-5 w-5", absentPatients.length > 0 ? "text-red-600" : "text-slate-400")} /></div><div><CardTitle className={cn("text-base", absentPatients.length > 0 ? "text-red-900" : "text-slate-600")}>Absent Patients</CardTitle><CardDescription className={cn("text-xs", absentPatients.length > 0 ? "text-red-700" : "text-slate-500")}>{absentPatients.length > 0 ? `${absentPatients.length} patient${absentPatients.length !== 1 ? 's' : ''}` : 'No absences'}</CardDescription></div></div>{absentPatients.length > 0 && (<Badge variant="outline" className="bg-red-100 text-red-700 border-red-300">{absentPatients.length}</Badge>)}</div></CardHeader>
              <CardContent className="max-h-[600px] overflow-y-auto">
                {absentPatients.length === 0 ? (<div className="text-center py-12"><div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3"><UserCheck className="h-8 w-8 text-slate-300" /></div><p className="text-sm text-slate-500 font-medium">All patients present</p><p className="text-xs text-slate-400 mt-1">No absences recorded</p></div>) : (<div className="space-y-3">{absentPatients.map((patient) => (<div key={patient.id} className="group relative p-4 rounded-lg border-2 border-red-200 bg-gradient-to-br from-red-50 to-orange-50 hover:shadow-md transition-all"><div className="absolute -top-2 -left-2"><div className="h-8 w-8 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold shadow-md">{getPositionDisplay(patient.queuePosition)}</div></div><div className="space-y-3 pt-2"><div><p className="font-bold text-red-900 truncate pr-6">{patient.patient?.fullName || 'Patient'}</p><p className="text-xs text-red-700 mt-1">{patient.patient?.phoneNumber || 'No phone'}</p></div><div className="flex items-center gap-2 text-xs text-red-600 bg-white/60 rounded px-2 py-1.5"><AlertCircle className="h-3 w-3 flex-shrink-0" /><span className="truncate">{patient.markedAbsentAt ? <>Absent {formatDistanceToNow(new Date(patient.markedAbsentAt), { addSuffix: true })}</> : 'Recently marked absent'}</span></div><div className="flex flex-col gap-2"><Button onClick={() => handleOpenRebook(patient)} disabled={actionLoading} size="sm" className="w-full bg-orange-500 hover:bg-orange-600 text-white shadow-sm">Rebook / Return</Button>{clinicConfig?.allowWaitlist && (<Button onClick={() => handleAddToWaitlist(patient)} disabled={actionLoading} size="sm" variant="outline" className="w-full border-orange-200 text-orange-600 hover:bg-orange-50">Add to Waitlist</Button>)}</div></div></div>))}</div>)}
              </CardContent>
            </Card>
            {absentPatients.length > 0 && (<div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg"><p className="text-xs text-orange-800 flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" /><span>Rebook absent patients or move them to the waitlist.</span></p></div>)}
          </div>
        </div>
      </div>

      {/* Dialog for non-present patient */}
      <Dialog open={nonPresentDialog.open} onOpenChange={(open) => setNonPresentDialog({ open, patient: nonPresentDialog.patient })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Patient Not Physically Present</DialogTitle>
            <DialogDescription>
              {nonPresentDialog.patient && (
                <>
                  <strong>{nonPresentDialog.patient.patient?.fullName || 'Patient'}</strong> is not marked as physically present.
                  You cannot call them until they are marked as present.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {nonPresentDialog.patient && (
              <>
                <Button
                  onClick={() => handleMarkPresent(nonPresentDialog.patient!.id)}
                  className="flex-1 bg-green-600 hover:bg-green-700"
                >
                  <UserCheck className="mr-2 h-4 w-4" />
                  Mark as Present
                </Button>
                <Button
                  onClick={() => setNonPresentDialog({ open: false, patient: null })}
                  variant="outline"
                  className="flex-1"
                >
                  <Clock className="mr-2 h-4 w-4" />
                  Wait (Grace Period)
                </Button>
                <Button
                  onClick={() => handleMarkAbsent(nonPresentDialog.patient!.id)}
                  variant="destructive"
                  className="flex-1"
                >
                  <UserX className="mr-2 h-4 w-4" />
                  Mark as Absent
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

{rebookDialog.patient && (
        <BookAppointmentDialog
          open={rebookDialog.open}
          onOpenChange={(open) => setRebookDialog(prev => ({ open, patient: open ? prev.patient : null }))}
          clinicId={clinicId}
          onSuccess={handleRebookSuccess}
          preselectedDate={rebookDialog.patient.startTime ? new Date(rebookDialog.patient.startTime) : new Date()}
          prefillPatient={{
            patientId: rebookDialog.patient.patientId || undefined,
            fullName: rebookDialog.patient.patient?.fullName,
            phoneNumber: rebookDialog.patient.patient?.phoneNumber,
          }}
          defaultAppointmentType={rebookDialog.patient.appointmentType}
          defaultReason="Late return rebooking"
          defaultStaffId={rebookDialog.patient.staffId || undefined}
        />
      )}
    </div>
  );
}