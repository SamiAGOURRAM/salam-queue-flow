/**
 * Enhanced Queue Manager - Premium Apple/Uber Design
 */
import { useState, useMemo, useEffect, useCallback } from "react";
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
  Check,
  FileText,
  Stethoscope,
  PauseCircle
} from "lucide-react";
import { useQueueService } from "@/hooks/useQueueService";
import { AppointmentStatus, ClinicResourceAvailability, QueueBreakState, QueueEntry, QueueMode, SkipReason } from "@/services/queue";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import { logger } from "@/services/shared/logging/Logger";
import { SlottedQueueView } from "./SlottedQueueView";
import { OrdinalQueueList } from "./OrdinalQueueList";
import { QueueRepository } from "@/services/queue/repositories/QueueRepository";
import { QueueService } from "@/services/queue/QueueService";
import { QueueStrategyFactory } from "@/services/queue/strategies/QueueStrategy";
import { noShowDetectorService } from "@/services/queue/NoShowDetectorService";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookAppointmentDialog } from "./BookAppointmentDialog";
import { waitlistService } from "@/services/queue/WaitlistService";
import { useToast } from "@/hooks/use-toast";
import { useClinicResources } from "@/hooks/useClinicResources";
import { ResourceAssignmentDialog } from "./ResourceAssignmentDialog";
import { useMedicalRecordAccess } from "@/hooks/useMedicalRecordAccess";
import { RequestMedicalHistoryDialog } from "./RequestMedicalHistoryDialog";
import { SharedRecordsPanel } from "./SharedRecordsPanel";
import { ConsultationPanel } from "./consultation";
import { useNoShowDetection } from "@/hooks/useNoShowDetection";
import { useNavigate } from "react-router-dom";

interface EnhancedQueueManagerProps {
  clinicId: string;
  userId: string;
  staffId?: string;
  targetQueueStaffId?: string;
  canManageMedicalRecords: boolean;
  useClinicWide?: boolean;
  allowedStaffIds?: string[];
  onSummaryChange?: (summary: { waiting: number; inProgress: number; absent: number; completed: number }) => void;
  onScheduleChange?: (schedule: QueueEntry[]) => void;
  resources?: ClinicResourceAvailability[];
  resourcesLoading?: boolean;
  refreshResources?: () => Promise<void>;
}

type WorkingDayRange = {
  start: Date;
  end: Date;
};

export function EnhancedQueueManager({
  clinicId,
  userId,
  staffId,
  targetQueueStaffId,
  canManageMedicalRecords,
  useClinicWide = true,
  allowedStaffIds,
  onSummaryChange,
  onScheduleChange,
  resources: externalResources,
  resourcesLoading: externalResourcesLoading,
  refreshResources: externalRefreshResources,
}: EnhancedQueueManagerProps) {
  const navigate = useNavigate();
  const [actionLoading, setActionLoading] = useState(false);
  const [clinicConfig, setClinicConfig] = useState<{ gracePeriodMinutes: number; allowWaitlist: boolean; workingDay?: WorkingDayRange | null } | null>(null);
  const [rebookDialog, setRebookDialog] = useState<{ open: boolean; patient: QueueEntry | null }>({ open: false, patient: null });
  const [activeTab, setActiveTab] = useState<'schedule' | 'absents'>('schedule');
  const [medicalDialogOpen, setMedicalDialogOpen] = useState(false);
  const [recordsPanelOpen, setRecordsPanelOpen] = useState(false);
  const [consultationPanelOpen, setConsultationPanelOpen] = useState(false);
  const [hasUnprintedOrdonnance, setHasUnprintedOrdonnance] = useState(false);

  const { 
    isLoading, error, schedule, queueMode, refreshSchedule, callNextPatient, 
    markPatientAbsent, completeAppointment, checkInPatient,
    markPatientPresent, markPatientNotPresent, resolveAbsentAppointment,
    callSpecificPatient
  } = useQueueService({
    staffId,
    clinicId,
    autoRefresh: true,
    useClinicWide,
    allowedStaffIds,
  });
  const [queueBreak, setQueueBreak] = useState<QueueBreakState | null>(null);
  const [breakNow, setBreakNow] = useState(() => Date.now());
  const [pendingCallContext, setPendingCallContext] = useState<{ mode: 'next' | 'specific'; appointmentId?: string } | null>(null);
  const { toast } = useToast();
  const shouldUseInternalResources =
    externalResources === undefined ||
    externalResourcesLoading === undefined ||
    externalRefreshResources === undefined;

  const {
    resources: hookResources,
    loading: hookResourcesLoading,
    refresh: refreshHookResources,
  } = useClinicResources(shouldUseInternalResources ? clinicId : undefined);
  const [resourceDialog, setResourceDialog] = useState<{ open: boolean; patient: QueueEntry | null }>({
    open: false,
    patient: null,
  });

  const resources = externalResources ?? hookResources;
  const resourcesLoading = externalResourcesLoading ?? hookResourcesLoading;
  const refreshResources = externalRefreshResources ?? refreshHookResources;

  const computeWorkingDayRange = (settings?: Record<string, unknown> | null): WorkingDayRange | null => {
    if (!settings) return null;
    const workingHoursRaw = settings.working_hours;
    if (!workingHoursRaw || typeof workingHoursRaw !== 'object' || Array.isArray(workingHoursRaw)) return null;

    const workingHours = workingHoursRaw as Record<string, { open?: string; close?: string; closed?: boolean }>;
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
        logger.warn('Failed to fetch clinic config, using defaults', {
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        toast({
          title: 'Configuration',
          description: 'Could not load clinic settings. Using default grace period (15 min).',
          variant: 'destructive',
        });
        setClinicConfig({ gracePeriodMinutes: 15, allowWaitlist: false, workingDay: null });
      }
    };
    if (staffId) {
      fetchClinicConfig();
    }
  }, [staffId]);

  const isSlottedMode = queueMode === QueueMode.SLOTTED || queueMode === QueueMode.HYBRID;

  const { currentPatient, waitingPatients, absentPatients, queueDisplayPatients, summary } = useMemo(() => {
    if (!schedule) return { currentPatient: null, waitingPatients: [], absentPatients: [], queueDisplayPatients: [], summary: { waiting: 0, inProgress: 0, absent: 0, completed: 0 } };
    const current = schedule.find(p => p.status === AppointmentStatus.IN_PROGRESS);
    
    const waiting = schedule.filter(p => 
      (p.status === AppointmentStatus.WAITING || p.status === AppointmentStatus.SCHEDULED) && 
      p.skipReason !== SkipReason.PATIENT_ABSENT
    );
    
    const absent = schedule.filter(p => p.skipReason === SkipReason.PATIENT_ABSENT && !p.returnedAt);
    const queueDisplay = [...waiting, ...absent].sort((a, b) => a.queuePosition - b.queuePosition);
    return { 
      currentPatient: current, 
      waitingPatients: waiting, 
      absentPatients: absent, 
      queueDisplayPatients: queueDisplay,
      summary: { waiting: waiting.length, inProgress: current ? 1 : 0, absent: absent.length, completed: schedule.filter(p => p.status === AppointmentStatus.COMPLETED).length }
    };
  }, [schedule]);

  const { countdownByAppointmentId, getCountdownForAppointment, expiringSoonCount, expiredCount } = useNoShowDetection(
    absentPatients,
    clinicConfig?.gracePeriodMinutes ?? 15
  );

  const {
    hasAccess: hasMedicalAccess,
    activeGrantId,
    expiresAt: medicalAccessExpiresAt,
    loading: medicalAccessLoading,
    refreshActiveGrant,
  } = useMedicalRecordAccess(currentPatient?.patientId);

  useEffect(() => {
    if (!currentPatient) {
      setMedicalDialogOpen(false);
      setRecordsPanelOpen(false);
      setConsultationPanelOpen(false);
      setHasUnprintedOrdonnance(false);
      return;
    }
    setRecordsPanelOpen(false);
    setConsultationPanelOpen(false);
    setHasUnprintedOrdonnance(false);
  }, [currentPatient?.id]);

  useEffect(() => {
    if (!canManageMedicalRecords) {
      setConsultationPanelOpen(false);
    }
  }, [canManageMedicalRecords]);

  useEffect(() => {
    if (onSummaryChange) {
      onSummaryChange(summary);
    }
  }, [summary, onSummaryChange]);

  useEffect(() => {
    if (onScheduleChange) {
      onScheduleChange(schedule);
    }
  }, [schedule, onScheduleChange]);

  useEffect(() => {
    if (!clinicId || !staffId) return;

    noShowDetectorService.initialize(clinicId, staffId);

    return () => {
      noShowDetectorService.cleanup();
    };
  }, [clinicId, staffId]);

  const handleAction = async (
    action: Promise<unknown>,
    afterSuccess?: (() => Promise<void>) | (() => void)
  ) => {
    setActionLoading(true);
    try {
      await action;
      if (afterSuccess) {
        await afterSuccess();
      }
    }
    catch (error) { 
      logger.error("Queue action failed", error instanceof Error ? error : new Error(String(error)), { clinicId, staffId }); 
    } 
    finally { setActionLoading(false); }
  };
  const [nonPresentDialog, setNonPresentDialog] = useState<{ open: boolean; patient: QueueEntry | null }>({ open: false, patient: null });
  const [queueService] = useState(() => new QueueService());

  const effectiveQueueStaffId = useMemo(() => {
    if (targetQueueStaffId) {
      return targetQueueStaffId;
    }
    if ((allowedStaffIds?.length ?? 0) === 1) {
      return allowedStaffIds?.[0];
    }
    return staffId;
  }, [allowedStaffIds, staffId, targetQueueStaffId]);

  const supportsBreakControls = useMemo(() => {
    if (!effectiveQueueStaffId) {
      return false;
    }
    if (!useClinicWide) {
      return true;
    }
    return (allowedStaffIds?.length ?? 0) === 1;
  }, [allowedStaffIds?.length, effectiveQueueStaffId, useClinicWide]);

  const queueBreakEndsAtMillis = queueBreak?.endsAt ? new Date(queueBreak.endsAt).getTime() : null;
  const queueBreakRemainingSeconds = queueBreakEndsAtMillis
    ? Math.max(0, Math.ceil((queueBreakEndsAtMillis - breakNow) / 1000))
    : 0;
  const isQueuePaused = queueBreakRemainingSeconds > 0;

  const formatBreakRemaining = (remainingSeconds: number) => {
    const minutes = Math.floor(remainingSeconds / 60).toString().padStart(2, '0');
    const seconds = Math.floor(remainingSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const refreshActiveBreak = useCallback(async () => {
    if (!clinicId || !effectiveQueueStaffId || !supportsBreakControls) {
      setQueueBreak(null);
      return;
    }

    try {
      const activeBreak = await queueService.getActiveQueueBreak(clinicId, effectiveQueueStaffId);
      setQueueBreak(activeBreak);
      setBreakNow(Date.now());
    } catch (error) {
      logger.warn('Failed to refresh active queue break status', {
        clinicId,
        effectiveQueueStaffId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      setQueueBreak(null);
    }
  }, [clinicId, effectiveQueueStaffId, queueService, supportsBreakControls]);

  useEffect(() => {
    void refreshActiveBreak();
  }, [refreshActiveBreak]);

  useEffect(() => {
    if (!supportsBreakControls) {
      return;
    }

    const intervalId = setInterval(() => {
      void refreshActiveBreak();
    }, 30_000);

    return () => clearInterval(intervalId);
  }, [refreshActiveBreak, supportsBreakControls]);

  useEffect(() => {
    if (!isQueuePaused) {
      return;
    }

    const tick = setInterval(() => {
      setBreakNow(Date.now());
    }, 1_000);

    return () => clearInterval(tick);
  }, [isQueuePaused]);

  const handleStartQueueBreak = async () => {
    if (!effectiveQueueStaffId) {
      return;
    }

    setActionLoading(true);
    try {
      const activeBreak = await queueService.startQueueBreak({
        clinicId,
        staffId: effectiveQueueStaffId,
        durationMinutes: 15,
        performedBy: userId,
        reason: 'Doctor break',
        pushSchedule: true,
      });

      setQueueBreak(activeBreak);
      setBreakNow(Date.now());
      await refreshSchedule();
      await refreshResources();

      toast({
        title: 'Queue paused',
        description: `Queue paused until ${format(new Date(activeBreak.endsAt), 'h:mm a')}.`,
      });
    } catch (error) {
      toast({
        title: 'Failed to pause queue',
        description: error instanceof Error ? error.message : 'Could not activate break mode.',
        variant: 'destructive',
      });
      logger.error('Failed to start queue break', error instanceof Error ? error : new Error(String(error)), {
        clinicId,
        effectiveQueueStaffId,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleResumeQueue = async () => {
    if (!effectiveQueueStaffId) {
      return;
    }

    setActionLoading(true);
    try {
      await queueService.endQueueBreak({
        clinicId,
        staffId: effectiveQueueStaffId,
        performedBy: userId,
        reason: 'Queue resumed manually',
      });

      setQueueBreak(null);
      setBreakNow(Date.now());
      await refreshSchedule();
      await refreshResources();

      toast({
        title: 'Queue resumed',
        description: 'Break mode has ended and queue calls are enabled again.',
      });
    } catch (error) {
      toast({
        title: 'Failed to resume queue',
        description: error instanceof Error ? error.message : 'Could not end break mode.',
        variant: 'destructive',
      });
      logger.error('Failed to end queue break', error instanceof Error ? error : new Error(String(error)), {
        clinicId,
        effectiveQueueStaffId,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const resolveNextPatientCandidate = async () => {
    const scheduleData = await queueService.getDailySchedule(
      staffId,
      new Date().toISOString().split('T')[0],
      useClinicWide,
      allowedStaffIds,
      clinicId
    );
    const strategy = QueueStrategyFactory.getStrategy(scheduleData.queue_mode);
    const nextPatient = await strategy.getNextPatient(scheduleData.schedule, {
      currentTime: new Date(),
      clinicId,
      staffId,
    });

    const candidate = nextPatient?.patient;
    if (candidate && 'appointmentDate' in candidate && 'queuePosition' in candidate) {
      return candidate;
    }
    return null;
  };

  const handleNextPatient = async () => {
    if (isQueuePaused && queueBreak?.endsAt) {
      toast({
        title: 'Queue is paused',
        description: `Break mode is active until ${format(new Date(queueBreak.endsAt), 'h:mm a')}.`,
      });
      return;
    }

    setActionLoading(true);
    try {
      const candidate = await resolveNextPatientCandidate();

      if (!candidate) {
        throw new Error('No patients present and waiting in queue');
      }

      if (!candidate.isPresent) {
        setNonPresentDialog({ open: true, patient: candidate });
        return;
      }

      if (resources.length > 0) {
        setPendingCallContext({ mode: 'next' });
        setResourceDialog({ open: true, patient: candidate });
        return;
      }

      await callNextPatient({
        clinicId,
        staffId,
        date: new Date(),
        performedBy: userId,
        skipAbsentPatients: true,
        useClinicWide,
        allowedStaffIds,
      });
      setPendingCallContext(null);
      await refreshResources();
    } catch (error) {
      const err = error as Error;
      if (err.message.includes('not physically present')) {
        const candidate = await resolveNextPatientCandidate();
        if (candidate && 'appointmentDate' in candidate && 'queuePosition' in candidate) {
          setNonPresentDialog({ open: true, patient: candidate });
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

  const handleCallSpecificPatient = async (appointmentId: string) => {
    if (isQueuePaused && queueBreak?.endsAt) {
      toast({
        title: 'Queue is paused',
        description: `Break mode is active until ${format(new Date(queueBreak.endsAt), 'h:mm a')}.`,
      });
      return;
    }

    if (currentPatient) {
      toast({
        title: 'A consultation is already active',
        description: 'Complete the current patient before calling another out of order.',
      });
      return;
    }

    const candidate = schedule.find((entry) => entry.id === appointmentId);
    if (!candidate) {
      return;
    }

    if (!candidate.isPresent) {
      setNonPresentDialog({ open: true, patient: candidate });
      return;
    }

    if (resources.length > 0) {
      setPendingCallContext({ mode: 'specific', appointmentId });
      setResourceDialog({ open: true, patient: candidate });
      return;
    }

    setActionLoading(true);
    try {
      await callSpecificPatient({
        appointmentId,
        clinicId,
        staffId,
        performedBy: userId,
        reason: 'Manual out-of-order call',
        useClinicWide,
        allowedStaffIds,
      });

      await refreshResources();
    } catch (error) {
      logger.error('Failed to call specific patient', error instanceof Error ? error : new Error(String(error)), {
        clinicId,
        appointmentId,
        staffId,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignResourceAndCall = async (resourceId?: string) => {
    if (isQueuePaused && queueBreak?.endsAt) {
      toast({
        title: 'Queue is paused',
        description: `Break mode is active until ${format(new Date(queueBreak.endsAt), 'h:mm a')}.`,
      });
      return;
    }

    setActionLoading(true);
    try {
      if (pendingCallContext?.mode === 'specific' && pendingCallContext.appointmentId) {
        await callSpecificPatient({
          appointmentId: pendingCallContext.appointmentId,
          clinicId,
          staffId,
          performedBy: userId,
          reason: 'Manual out-of-order call',
          resourceId,
          useClinicWide,
          allowedStaffIds,
        });
      } else {
        await callNextPatient({
          clinicId,
          staffId,
          date: new Date(),
          performedBy: userId,
          skipAbsentPatients: true,
          resourceId,
          useClinicWide,
          allowedStaffIds,
        });
      }
      setResourceDialog({ open: false, patient: null });
      setPendingCallContext(null);
      await refreshResources();
    } catch (error) {
      logger.error("Failed to assign resource while calling patient", error instanceof Error ? error : new Error(String(error)), {
        clinicId,
        staffId,
        resourceId,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkAbsent = (appointmentId: string) => {
    setNonPresentDialog({ open: false, patient: null });
    setResourceDialog({ open: false, patient: null });
    setPendingCallContext(null);
    handleAction(markPatientAbsent({ appointmentId, performedBy: userId, reason: 'Patient not present' }));
  };
  const handleCompleteAppointment = () => {
    if (currentPatient) {
      handleAction(completeAppointment(currentPatient.id, userId), refreshResources);
    }
  };
  const handleCheckIn = (appointmentId: string) => handleAction(checkInPatient(appointmentId));
  const handleMarkPresent = (appointmentId: string) => {
    setNonPresentDialog({ open: false, patient: null });
    setResourceDialog({ open: false, patient: null });
    handleAction(markPatientPresent(appointmentId, userId));
  };
  const handleMarkNotPresent = (appointmentId: string) => handleAction(markPatientNotPresent(appointmentId, userId));

  const handleOpenRebook = (patient: QueueEntry) => {
    setRebookDialog({ open: true, patient });
  };

  const handleMedicalAccessActivated = () => {
    setRecordsPanelOpen(true);
    void refreshActiveGrant();
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
      const targetDate = new Date(patient.appointmentDate);
      await waitlistService.addToWaitlist(
        clinicId,
        targetDate,
        patient.patientId || undefined,
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

  const parseScheduledDateTime = (entry: QueueEntry): Date | null => {
    if (!entry.scheduledTime) return null;

    const parsedDate = new Date(entry.appointmentDate);
    if (Number.isNaN(parsedDate.getTime())) return null;

    const match = entry.scheduledTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3] ?? '0');

    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      Number.isNaN(seconds) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59 ||
      seconds < 0 ||
      seconds > 59
    ) {
      return null;
    }

    const scheduledAt = new Date(parsedDate);
    scheduledAt.setHours(hours, minutes, seconds, 0);

    return Number.isNaN(scheduledAt.getTime()) ? null : scheduledAt;
  };

  const hasCallableWaitingPatient = useMemo(() => {
    if (!waitingPatients.length) return false;

    if (!isSlottedMode) {
      return waitingPatients.some((patient) => patient.isPresent);
    }

    const now = new Date();
    return waitingPatients.some((patient) => {
      if (patient.isPresent) return true;
      const scheduledAt = parseScheduledDateTime(patient);
      return Boolean(scheduledAt && scheduledAt <= now);
    });
  }, [isSlottedMode, waitingPatients]);

  const nextThreePrepPatients = useMemo(() => {
    return [...waitingPatients]
      .sort((a, b) => a.queuePosition - b.queuePosition)
      .slice(0, 3);
  }, [waitingPatients]);

  const openAppointmentDetails = (appointmentId: string) => {
    navigate(`/clinic/appointments/${appointmentId}`);
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
        <Button onClick={refreshSchedule} size="sm" variant="outline">Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Inline Stats Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

        {supportsBreakControls && (
          <div className="flex items-center gap-2">
            {isQueuePaused && queueBreak ? (
              <>
                <Badge variant="outline" className="h-8 rounded-full px-3 border-amber-300/70 text-amber-700">
                  Break {formatBreakRemaining(queueBreakRemainingSeconds)}
                </Badge>
                <Button
                  onClick={handleResumeQueue}
                  disabled={actionLoading}
                  size="sm"
                  variant="outline"
                  className="h-8 px-3"
                >
                  Resume Queue
                </Button>
              </>
            ) : (
              <Button
                onClick={handleStartQueueBreak}
                disabled={actionLoading}
                size="sm"
                variant="outline"
                className="h-8 px-3"
              >
                <PauseCircle className="w-3.5 h-3.5 mr-1.5" />
                Pause 15m
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Current Patient - Narrow Strip */}
      {currentPatient ? (
        <div className="flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
              <Play className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <p className="font-medium text-foreground truncate">
                  {currentPatient.patient?.fullName || 'Patient'}
                </p>
                {currentPatient.resource?.name && (
                  <Badge variant="outline" className="h-5 rounded-full text-[10px] px-2 border-emerald-300/60 text-emerald-700">
                    {currentPatient.resource.name}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {currentPatient.appointmentType || 'Appointment'}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <div className="flex items-center gap-2">
              {currentPatient.patientId && (
                <>
                  <Button
                    onClick={() => {
                      if (hasMedicalAccess && activeGrantId) {
                        setRecordsPanelOpen(true);
                        return;
                      }
                      setMedicalDialogOpen(true);
                    }}
                    disabled={actionLoading || medicalAccessLoading}
                    size="sm"
                    variant={hasMedicalAccess ? 'default' : 'outline'}
                    className={cn(
                      "h-9 px-3 font-medium",
                      hasMedicalAccess ? "bg-blue-600 hover:bg-blue-700 text-white" : ""
                    )}
                  >
                    <FileText className="w-4 h-4 mr-1.5" />
                    {hasMedicalAccess ? 'View Records' : 'Request History'}
                  </Button>
                  {canManageMedicalRecords && (
                    <Button
                      onClick={() => setConsultationPanelOpen((prev) => !prev)}
                      disabled={actionLoading}
                      size="sm"
                      variant={consultationPanelOpen ? 'default' : 'outline'}
                      className={cn("h-9 px-3 font-medium", consultationPanelOpen ? "bg-cyan-700 hover:bg-cyan-800 text-white" : "")}
                    >
                      <Stethoscope className="w-4 h-4 mr-1.5" />
                      Consultation
                    </Button>
                  )}
                  <Button
                    onClick={() => openAppointmentDetails(currentPatient.id)}
                    disabled={actionLoading}
                    size="sm"
                    variant="outline"
                    className="h-9 px-3 font-medium"
                  >
                    Details
                  </Button>
                </>
              )}
              <Button
                onClick={handleCompleteAppointment}
                disabled={actionLoading}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white h-9 px-4 font-medium"
              >
                <Check className="w-4 h-4 mr-1.5" />
                Complete
              </Button>
            </div>
            {hasUnprintedOrdonnance && (
              <p className="text-[11px] text-amber-700 font-medium">
                Ordonnance not printed yet.
              </p>
            )}
          </div>
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
                resourcesLoading ||
                isQueuePaused ||
                !hasCallableWaitingPatient
              }
              size="sm"
              className="bg-foreground text-background hover:bg-foreground/90 h-9 px-4 font-medium"
            >
              <ChevronRight className="w-4 h-4 mr-1" />
              {isQueuePaused ? 'Queue Paused' : 'Call Next'}
            </Button>
          )}
        </div>
      )}

      {nextThreePrepPatients.length > 0 && (
        <div className="border border-border rounded-lg bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="text-sm font-medium text-foreground">Next 3 to Prepare</p>
            <p className="text-xs text-muted-foreground">
              {isQueuePaused ? 'Queue paused' : 'Review charts before calling'}
            </p>
          </div>
          <div className="divide-y divide-border/70">
            {nextThreePrepPatients.map((patient) => (
              <div key={patient.id} className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      #{patient.queuePosition}
                    </span>
                    <p className="text-sm font-medium text-foreground truncate">
                      {patient.patient?.fullName || 'Patient'}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {patient.appointmentType || 'Appointment'}
                    {patient.scheduledTime ? ` • ${patient.scheduledTime}` : ''}
                  </p>
                </div>
                <Button
                  onClick={() => handleCallSpecificPatient(patient.id)}
                  disabled={actionLoading || Boolean(currentPatient) || !patient.isPresent || isQueuePaused}
                  size="sm"
                  variant="outline"
                  className="h-8 px-3"
                >
                  Call Now
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {canManageMedicalRecords && consultationPanelOpen && currentPatient?.patientId && (
        <ConsultationPanel
          appointmentId={currentPatient.id}
          patientId={currentPatient.patientId}
          clinicId={clinicId}
          doctorUserId={userId}
          sourceStaffId={staffId}
          patientName={currentPatient.patient?.fullName}
          onUnprintedOrdonnanceChange={setHasUnprintedOrdonnance}
        />
      )}

      {recordsPanelOpen && currentPatient?.patientId && (
        <SharedRecordsPanel
          grantId={activeGrantId}
          patientName={currentPatient.patient?.fullName}
          expiresAt={medicalAccessExpiresAt}
          onClose={() => setRecordsPanelOpen(false)}
          onExpired={() => {
            setRecordsPanelOpen(false);
            void refreshActiveGrant();
          }}
        />
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
                : `${summary.absent} absent${expiringSoonCount > 0 ? ` • ${expiringSoonCount} expiring soon` : ''}${expiredCount > 0 ? ` • ${expiredCount} expired` : ''}`}
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
                  onCallPatient={handleCallSpecificPatient}
                  onOpenAppointment={openAppointmentDetails}
                  actionLoading={actionLoading}
                  gracePeriodMinutes={clinicConfig?.gracePeriodMinutes}
                  workingDayStart={clinicConfig?.workingDay?.start}
                  workingDayEnd={clinicConfig?.workingDay?.end}
                  countdownByAppointmentId={countdownByAppointmentId}
                />
              ) : (
                <OrdinalQueueList
                  patients={queueDisplayPatients}
                  currentPatient={currentPatient}
                  onMarkAbsent={handleMarkAbsent}
                  onMarkPresent={handleMarkPresent}
                  onMarkNotPresent={handleMarkNotPresent}
                  onCallPatient={handleCallSpecificPatient}
                  onOpenAppointment={openAppointmentDetails}
                  loading={actionLoading}
                  countdownByAppointmentId={countdownByAppointmentId}
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
                  {absentPatients.map((patient) => {
                    const graceCountdown = getCountdownForAppointment(patient.id);

                    return (
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
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              <p className="text-xs text-muted-foreground">
                                {patient.markedAbsentAt
                                  ? formatDistanceToNow(new Date(patient.markedAbsentAt), { addSuffix: true })
                                  : 'Recently marked'}
                              </p>
                              {graceCountdown && (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "h-5 rounded-full text-[10px] px-2 font-medium",
                                    graceCountdown.urgency === 'expired' && "border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 bg-red-100/60 dark:bg-red-950/50",
                                    graceCountdown.urgency === 'expiring' && "border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-950/50",
                                    graceCountdown.urgency === 'normal' && "border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-100/60 dark:bg-slate-900/50"
                                  )}
                                >
                                  <Clock className="h-3 w-3 mr-1" />
                                  {graceCountdown.isExpired
                                    ? 'Grace expired'
                                    : `Grace ${graceCountdown.label} left`}
                                </Badge>
                              )}
                            </div>
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
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <ResourceAssignmentDialog
        open={resourceDialog.open}
        onOpenChange={(open) => {
          setResourceDialog((prev) => ({ open, patient: open ? prev.patient : null }));
          if (!open) {
            setPendingCallContext(null);
          }
        }}
        patient={resourceDialog.patient}
        resources={resources}
        schedule={schedule}
        loading={actionLoading || resourcesLoading}
        onAssign={handleAssignResourceAndCall}
      />

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
          preselectedDate={new Date(rebookDialog.patient.appointmentDate)}
          prefillPatient={{
            patientId: rebookDialog.patient.patientId || undefined,
            fullName: rebookDialog.patient.patient?.fullName,
            phoneNumber: rebookDialog.patient.patient?.phoneNumber,
          }}
          defaultAppointmentType={rebookDialog.patient.appointmentType}
          defaultReason="Late return rebooking"
          defaultStaffId={rebookDialog.patient.staffId || undefined}
          allowedStaffIds={allowedStaffIds}
        />
      )}

      <RequestMedicalHistoryDialog
        open={medicalDialogOpen}
        onOpenChange={setMedicalDialogOpen}
        clinicId={clinicId}
        patientId={currentPatient?.patientId}
        appointmentId={currentPatient?.id}
        patientName={currentPatient?.patient?.fullName}
        onAccessActivated={handleMedicalAccessActivated}
      />
    </div>
  );
}
