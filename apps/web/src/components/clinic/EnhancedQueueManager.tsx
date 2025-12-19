/**
 * Enhanced Queue Manager - Redesigned with Tabs for Schedule/Absents
 */
import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  AlertTriangle, 
  Calendar, 
  List
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

  if (isLoading && schedule.length === 0) return <div className="flex items-center justify-center p-16"><RefreshCw className="h-10 w-10 animate-spin text-primary" /><p className="ml-4">Loading Schedule...</p></div>;
  if (error) return <Card className="border-2 border-destructive/50 bg-destructive/5"><CardHeader><CardTitle className="text-destructive flex items-center gap-2"><AlertCircle/>Error</CardTitle><CardDescription>{error.message}</CardDescription></CardHeader><CardContent><Button onClick={refreshQueue}>Retry</Button></CardContent></Card>;

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-2 border-border/80 shadow-md hover:shadow-lg transition-all">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground-secondary mb-1">Waiting</p>
                <p className="text-3xl font-bold text-foreground-primary">{summary.waiting}</p>
              </div>
              <div className="p-3 rounded-xl bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-border/80 shadow-md hover:shadow-lg transition-all">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground-secondary mb-1">In Progress</p>
                <p className="text-3xl font-bold text-foreground-primary">{summary.inProgress}</p>
              </div>
              <div className="p-3 rounded-xl bg-teal/10">
                <Play className="h-6 w-6 text-teal" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-border/80 shadow-md hover:shadow-lg transition-all">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground-secondary mb-1">Absent</p>
                <p className="text-3xl font-bold text-foreground-primary">{summary.absent}</p>
              </div>
              <div className="p-3 rounded-xl bg-destructive/10">
                <UserX className="h-6 w-6 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-border/80 shadow-md hover:shadow-lg transition-all">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground-secondary mb-1">Completed</p>
                <p className="text-3xl font-bold text-foreground-primary">{summary.completed}</p>
              </div>
              <div className="p-3 rounded-xl bg-success/10">
                <CheckCircle className="h-6 w-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Current Patient - Thin Row */}
      {currentPatient ? (
        <Card className="border-2 border-teal/40 bg-teal/5 shadow-md">
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <div className="w-1 h-12 rounded-full bg-teal"></div>
              <Avatar className="h-12 w-12 border-2 border-teal/30">
                <AvatarFallback className="bg-teal text-white text-sm font-bold">
                  {getInitials(currentPatient.patient?.fullName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-foreground-primary">
                    {currentPatient.patient?.fullName || 'Patient'}
                  </h3>
                  <Badge className="bg-teal text-white border-0">
                    <Play className="h-3 w-3 mr-1" />
                    In Progress
                  </Badge>
                </div>
                <p className="text-sm text-foreground-secondary mt-0.5">
                  {currentPatient.appointmentType || 'Appointment'} • {currentPatient.patient?.phoneNumber || 'No phone'}
                </p>
              </div>
              <Button 
                onClick={handleCompleteAppointment} 
                disabled={actionLoading} 
                className="bg-teal hover:bg-teal-600 shadow-sm"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Complete
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-2 border-border/80 shadow-md">
          <CardContent className="py-12 text-center">
            <div className="h-16 w-16 rounded-full bg-background-tertiary flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-foreground-muted" />
            </div>
            <p className="text-foreground-primary font-medium mb-1">No patient being served</p>
            <p className="text-sm text-foreground-muted">Call next patient to start</p>
          </CardContent>
        </Card>
      )}

      {/* Main Content with Tabs */}
      <Card className="border-2 border-border/80 shadow-md">
        <CardHeader className="border-b-2 border-border/80">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold text-foreground-primary flex items-center gap-2">
                {isSlottedMode ? <Calendar className="h-5 w-5 text-primary" /> : <List className="h-5 w-5 text-primary" />}
                {isSlottedMode ? 'Scheduled Appointments' : 'Next Appointments'}
              </CardTitle>
              <CardDescription className="text-sm text-foreground-secondary mt-1">
                {activeTab === 'schedule' 
                  ? (isSlottedMode 
                      ? `${summary.waiting} scheduled appointment${summary.waiting !== 1 ? 's' : ''}`
                      : `${summary.waiting} patient${summary.waiting !== 1 ? 's' : ''} waiting`)
                  : `${summary.absent} absent patient${summary.absent !== 1 ? 's' : ''}`
                }
              </CardDescription>
            </div>
            {activeTab === 'schedule' && waitingPatients.length > 0 && !currentPatient && (
              <Button 
                onClick={handleNextPatient} 
                disabled={
                  actionLoading || 
                  (isSlottedMode 
                    ? waitingPatients.filter(p => p.isPresent || (p.startTime && new Date(p.startTime) <= new Date())).length === 0
                    : waitingPatients.filter(p => p.isPresent).length === 0)
                } 
                size="lg"
                className="bg-primary hover:bg-primary-600 shadow-md"
              >
                <ChevronRight className="mr-2 h-5 w-5" />
                Call Next
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'schedule' | 'absents')} className="w-full">
            <TabsList className="mb-6 bg-background-tertiary">
              <TabsTrigger value="schedule" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Calendar className="h-4 w-4 mr-2" />
                Schedule
              </TabsTrigger>
              <TabsTrigger value="absents" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <UserX className="h-4 w-4 mr-2" />
                Absents
                {absentPatients.length > 0 && (
                  <Badge className="ml-2 bg-destructive text-destructive-foreground border-0">
                    {absentPatients.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

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
                  <div className="h-16 w-16 rounded-full bg-background-tertiary flex items-center justify-center mx-auto mb-3">
                    <UserCheck className="h-8 w-8 text-foreground-muted" />
                  </div>
                  <p className="text-sm text-foreground-muted font-medium">All patients present</p>
                  <p className="text-xs text-foreground-muted/70 mt-1">No absences recorded</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {absentPatients.map((patient) => (
                    <div key={patient.id} className="group relative p-4 rounded-xl border-2 border-destructive/30 bg-destructive/5 hover:shadow-sm transition-all">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10 border-2 border-destructive/30">
                          <AvatarFallback className="bg-destructive/10 text-destructive text-sm font-bold">
                            {getInitials(patient.patient?.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-foreground-primary truncate">{patient.patient?.fullName || 'Patient'}</p>
                          <p className="text-xs text-foreground-muted mt-1">{patient.patient?.phoneNumber || 'No phone'}</p>
                          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 rounded px-2 py-1 mt-2">
                            <AlertCircle className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">
                              {patient.markedAbsentAt ? `Absent ${formatDistanceToNow(new Date(patient.markedAbsentAt), { addSuffix: true })}` : 'Recently marked absent'}
                            </span>
                          </div>
                          <div className="flex flex-col gap-2 mt-3">
                            <Button 
                              onClick={() => handleOpenRebook(patient)} 
                              disabled={actionLoading} 
                              size="sm" 
                              className="w-full bg-warning hover:bg-warning-600 text-white shadow-sm"
                            >
                              Rebook / Return
                            </Button>
                            {clinicConfig?.allowWaitlist && (
                              <Button 
                                onClick={() => handleAddToWaitlist(patient)} 
                                disabled={actionLoading} 
                                size="sm" 
                                variant="outline" 
                                className="w-full border-warning/40 text-warning hover:bg-warning/10"
                              >
                                Add to Waitlist
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

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
                  className="flex-1 bg-success hover:bg-success-600"
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
