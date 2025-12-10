/**
 * useQueueService Hook (Definitive, Corrected Implementation)
 * Provides a reactive, real-time interface to the full QueueService.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
// CORRECT: Imports the SERVICE, not the repository.
import { QueueService } from '../services/queue/QueueService'; 

// --- CORRECTED IMPORTS ---
// eventBus is in the SHARED events folder.
import { eventBus } from '../services/shared/events/EventBus';
// QueueEventType is specific to the QUEUE service module.
import { QueueEventType } from '../services/queue/events/QueueEvents';
// --- END CORRECTIONS ---

import { logger } from '../services/shared/logging/Logger';
import { useToast } from './use-toast';
// CORRECT: Imports the data models from the service layer's public interface.
import { QueueEntry, CreateQueueEntryDTO, MarkAbsentDTO, ReorderQueueDTO, CallNextPatientDTO } from '../services/queue';

export interface ScheduleData {
  operatingMode: string;
  queueMode: string; // 'fluid' | 'slotted'
  schedule: QueueEntry[];
}

interface UseQueueServiceOptions {
  staffId?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function useQueueService(options: UseQueueServiceOptions) {
  const { staffId, autoRefresh = true, refreshInterval } = options;

  const [scheduleData, setScheduleData] = useState<ScheduleData>({ operatingMode: 'none', queueMode: 'fluid', schedule: [] });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  
  const [queueService] = useState(() => new QueueService());
  const { toast } = useToast();

  // Helper function to get today's date in local timezone (YYYY-MM-DD)
  const getTodayLocal = (): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const refreshSchedule = useCallback(async () => {
    if (!staffId) {
      setIsLoading(false);
      setScheduleData({ operatingMode: 'none', queueMode: 'fluid', schedule: [] });
      return;
    }
    setIsLoading(true);
    try {
      const today = getTodayLocal(); // Use local timezone instead of UTC
      logger.debug("Fetching appointments for Live Queue", {
        staffId,
        date: today,
        note: "Live Queue always shows today's appointments"
      });
      
      const data = await queueService.getDailySchedule(staffId, today);
      
      logger.debug("Appointments fetched for Live Queue", {
        date: today,
        count: data.schedule?.length || 0,
        queueMode: data.queue_mode,
        operatingMode: data.operating_mode,
        appointments: data.schedule?.map(apt => ({
          id: apt.id,
          patient: apt.patient?.fullName || apt.guestPatient?.fullName || 'Unknown',
          status: apt.status,
          appointmentDate: apt.appointmentDate,
          startTime: apt.startTime,
        })) || []
      });
      
      setScheduleData({
        operatingMode: data.operating_mode || 'none',
        queueMode: data.queue_mode || 'fluid',
        schedule: data.schedule || [],
      });
      setError(null);
    } catch (err) {
      const error = err as Error;
      setError(error);
      logger.error('Failed to refresh schedule', error, { staffId, date: getTodayLocal() });
    } finally {
      setIsLoading(false);
    }
  }, [staffId, queueService]);

  useEffect(() => { 
    refreshSchedule(); 
  }, [refreshSchedule]);

  // Memoize the event handler to prevent re-subscriptions
  const eventHandlerRef = useRef<(() => void) | null>(null);
  eventHandlerRef.current = () => {
    logger.debug('Refresh triggered by event');
    refreshSchedule();
  };

  useEffect(() => {
    if (!autoRefresh) return;
    
    // Use a stable handler that calls the ref
    const handler = () => {
      eventHandlerRef.current?.();
    };
    
    const events: QueueEventType[] = [
      QueueEventType.PATIENT_ADDED_TO_QUEUE,
      QueueEventType.APPOINTMENT_STATUS_CHANGED,
      QueueEventType.PATIENT_RETURNED,
      QueueEventType.PATIENT_MARKED_ABSENT,
      QueueEventType.QUEUE_POSITION_CHANGED
    ];
    const subscriptions = events.map(event => eventBus.subscribe(event, handler));
    return () => subscriptions.forEach(unsub => unsub());
  }, [autoRefresh]); // Remove refreshSchedule from dependencies - use ref instead

  useEffect(() => {
    if (!refreshInterval) return;
    const intervalId = setInterval(refreshSchedule, refreshInterval);
    return () => clearInterval(intervalId);
  }, [refreshInterval, refreshSchedule]);

  // --- ACTION IMPLEMENTATIONS WRAPPED WITH TOASTS AND REFRESH ---

  const performAction = useCallback(async <T,>(action: Promise<T>, messages: { success: string; error: string }): Promise<T> => {
    try {
      const result = await action;
      toast({ title: messages.success });
      await refreshSchedule();
      return result;
    } catch (err) {
      const error = err as Error;
      toast({ title: messages.error, description: error.message, variant: 'destructive' });
      throw error;
    }
  }, [refreshSchedule, toast]);

  const createAppointment = (dto: CreateQueueEntryDTO) => performAction(
    queueService.createAppointment(dto),
    { success: 'Appointment Created', error: 'Failed to Create Appointment' }
  );

  const callNextPatient = (dto: CallNextPatientDTO) => performAction(
    queueService.callNextPatient(dto),
    { success: 'Next Patient Called', error: 'Failed to Call Patient' }
  );

  const markPatientAbsent = (dto: MarkAbsentDTO) => performAction(
    queueService.markPatientAbsent(dto),
    { success: 'Patient Marked Absent', error: 'Failed to Mark Absent' }
  );

  const markPatientReturned = (appointmentId: string, performedBy: string) => performAction(
    queueService.markPatientReturned(appointmentId, performedBy),
    { success: 'Patient Returned to Queue', error: 'Failed to Return Patient' }
  );

  const resolveAbsentAppointment = (appointmentId: string, performedBy: string, resolution: 'rebooked' | 'waitlist') => performAction(
    queueService.resolveAbsentAppointment({ appointmentId, performedBy, resolution }),
    { success: 'Absent patient resolved', error: 'Failed to resolve absent patient' }
  );

  const completeAppointment = (appointmentId: string, performedBy: string) => performAction(
    queueService.completeAppointment(appointmentId, performedBy),
    { success: 'Appointment Completed', error: 'Failed to Complete' }
  );

  const reorderQueue = (dto: ReorderQueueDTO) => performAction(
    queueService.reorderQueue(dto),
    { success: 'Queue Reordered', error: 'Failed to Reorder' }
  );

    const checkInPatient = (appointmentId: string, performedBy: string) => performAction(
    queueService.checkInPatient(appointmentId, performedBy),
    { success: 'Patient Checked In', error: 'Failed to Check In' }
  );

  const markPatientPresent = (appointmentId: string, performedBy: string) => performAction(
    queueService.markPatientPresent(appointmentId, performedBy),
    { success: 'Patient Marked as Present', error: 'Failed to Mark Present' }
  );

  const markPatientNotPresent = (appointmentId: string, performedBy: string) => performAction(
    queueService.markPatientNotPresent(appointmentId, performedBy),
    { success: 'Patient Marked as Not Present', error: 'Failed to Mark Not Present' }
  );


  return {
    isLoading,
    error,
    operatingMode: scheduleData.operatingMode,
    queueMode: scheduleData.queueMode,
    schedule: scheduleData.schedule,
    refreshSchedule,
    createAppointment,
    checkInPatient,
    callNextPatient,
    markPatientAbsent,
    markPatientReturned,
    markPatientPresent,
    markPatientNotPresent,
    resolveAbsentAppointment,
    completeAppointment,
    reorderQueue,
  };
}