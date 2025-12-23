/**
 * Enhanced Queue Manager - Premium Apple/Uber Design
 */
import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  UserX,
  Clock,
  AlertCircle,
  ChevronRight,
  Users,
  CheckCircle,
  RefreshCw,
  Play,
  UserCheck,
  Calendar,
  List,
  Check
} from "lucide-react";
import { useQueueService } from "@/hooks/useQueueService";
import { AppointmentStatus, QueueEntry, SkipReason } from "@/services/queue";
import { formatDistanceToNow, format } from "date-fns";
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
  const [activeTab, setActiveTab] = useState<'schedule' | 'absents'>('schedule');

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

  const isSlottedMode = queueMode === 'slotted';

  const { currentPatient, waitingPatients, absentPatients, summary } = useMemo(() => {
    if (!schedule) return { currentPatient: null, waitingPatients: [], absentPatients: [], summary: { waiting: 0, inProgress: 0, absent: 0, completed: 0 } };
    const current = schedule.find(p => p.status === AppointmentStatus.IN_PROGRESS);
    
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

  useEffect(() => {
    if (onSummaryChange) {
      onSummaryChange(summary);
    }
  }, [summary, onSummaryChange]);

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
      if (err.message.includes('not physically present')) {
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

  const formatWaitTime = (entry: QueueEntry) => !entry.checkedInAt ? "Not checked in" : formatDistanceToNow(new Date(entry.checkedInAt), { addSuffix: true });
  const getInitials = (name?: string) => !name ? "?" : name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  if (isLoading && schedule.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-destructive/30 bg-destructive/5 rounded-lg p-6 text-center">
        <AlertCircle className="h-5 w-5 text-destructive mx-auto mb-2" />
        <p className="text-sm text-destructive font-medium mb-3">{error.message}</p>
        <Button onClick={refreshQueue} size="sm" variant="outline">Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Inline Stats Bar */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span className="text-muted-foreground">Waiting</span>
          <span className="font-semibold text-foreground">{summary.waiting}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground">Active</span>
          <span className="font-semibold text-foreground">{summary.inProgress}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-muted-foreground">Absent</span>
          <span className="font-semibold text-foreground">{summary.absent}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-gray-400" />
          <span className="text-muted-foreground">Done</span>
          <span className="font-semibold text-foreground">{summary.completed}</span>
        </div>
      </div>

      {/* Current Patient - Narrow Strip */}
      {currentPatient ? (
        <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
              <Play className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">
                {currentPatient.patient?.fullName || 'Patient'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {currentPatient.appointmentType || 'Appointment'}
              </p>
            </div>
          </div>
          <Button
            onClick={handleCompleteAppointment}
            disabled={actionLoading}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 px-4 font-medium flex-shrink-0"
          >
            <Check className="w-4 h-4 mr-1.5" />
            Complete
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between bg-muted/50 border border-border rounded-lg px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <Users className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No patient being served</p>
          </div>
          {waitingPatients.length > 0 && (
            <Button
              onClick={handleNextPatient}
              disabled={
                actionLoading ||
                (isSlottedMode
                  ? waitingPatients.filter(p => p.isPresent || (p.startTime && new Date(p.startTime) <= new Date())).length === 0
                  : waitingPatients.filter(p => p.isPresent).length === 0)
              }
              size="sm"
              className="bg-foreground text-background hover:bg-foreground/90 h-9 px-4 font-medium"
            >
              <ChevronRight className="w-4 h-4 mr-1" />
              Call Next
            </Button>
          )}
        </div>
      )}

      {/* Main Content with Tabs */}
      <div className="border border-border rounded-lg bg-card">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'schedule' | 'absents')} className="w-full">
          {/* Tab Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <TabsList className="bg-muted/50 h-8 p-0.5">
              <TabsTrigger
                value="schedule"
                className="h-7 px-3 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                {isSlottedMode ? <Calendar className="h-3.5 w-3.5 mr-1.5" /> : <List className="h-3.5 w-3.5 mr-1.5" />}
                {isSlottedMode ? 'Schedule' : 'Queue'}
              </TabsTrigger>
              <TabsTrigger
                value="absents"
                className="h-7 px-3 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <UserX className="h-3.5 w-3.5 mr-1.5" />
                Absent
                {absentPatients.length > 0 && (
                  <span className="ml-1.5 bg-red-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                    {absentPatients.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <p className="text-xs text-muted-foreground">
              {activeTab === 'schedule'
                ? `${summary.waiting} waiting`
                : `${summary.absent} absent`}
            </p>
          </div>

          {/* Tab Content */}
          <div className="p-4">
            <TabsContent value="schedule" className="mt-0">
              {isSlottedMode ? (
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
                <OrdinalQueueList
                  patients={waitingPatients}
                  currentPatient={currentPatient}
                  onMarkAbsent={handleMarkAbsent}
                  onMarkPresent={handleMarkPresent}
                  onMarkNotPresent={handleMarkNotPresent}
                  loading={actionLoading}
                />
              )}
            </TabsContent>

            <TabsContent value="absents" className="mt-0">
              {absentPatients.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                    <UserCheck className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">All patients present</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {absentPatients.map((patient) => (
                    <div
                      key={patient.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                            {getInitials(patient.patient?.fullName)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {patient.patient?.fullName || 'Patient'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {patient.markedAbsentAt
                              ? formatDistanceToNow(new Date(patient.markedAbsentAt), { addSuffix: true })
                              : 'Recently marked'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          onClick={() => handleOpenRebook(patient)}
                          disabled={actionLoading}
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/50"
                        >
                          Rebook
                        </Button>
                        {clinicConfig?.allowWaitlist && (
                          <Button
                            onClick={() => handleAddToWaitlist(patient)}
                            disabled={actionLoading}
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                          >
                            Waitlist
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Dialog for non-present patient */}
      <Dialog open={nonPresentDialog.open} onOpenChange={(open) => setNonPresentDialog({ open, patient: nonPresentDialog.patient })}>
        <DialogContent className="sm:max-w-sm rounded-[8px] p-0 gap-0">
          {/* Premium Header */}
          <div className="p-5 border-b border-border">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-[4px] bg-amber-500 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold tracking-tight">Patient Not Present</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground mt-0.5">
                  {nonPresentDialog.patient && (
                    <>
                      <span className="font-medium text-foreground">{nonPresentDialog.patient.patient?.fullName || 'Patient'}</span> has not checked in
                    </>
                  )}
                </DialogDescription>
              </div>
            </div>
          </div>
          
          <div className="p-5 space-y-3">
            {nonPresentDialog.patient && (
              <>
                <Button
                  onClick={() => handleMarkPresent(nonPresentDialog.patient!.id)}
                  className="w-full h-10 rounded-[4px] bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <UserCheck className="mr-2 h-4 w-4" />
                  Mark Present
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    onClick={() => setNonPresentDialog({ open: false, patient: null })}
                    variant="outline"
                    className="w-full h-10 rounded-[4px]"
                  >
                    <Clock className="mr-2 h-4 w-4" />
                    Wait
                  </Button>
                  <Button
                    onClick={() => handleMarkAbsent(nonPresentDialog.patient!.id)}
                    variant="outline"
                    className="w-full h-10 rounded-[4px] text-red-600 border-red-200 hover:bg-red-50"
                  >
                    <UserX className="mr-2 h-4 w-4" />
                    Absent
                  </Button>
                </div>
              </>
            )}
          </div>
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
