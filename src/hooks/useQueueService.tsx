/**
 * useQueueService Hook (Definitive, Corrected Implementation)
 * Provides a reactive, real-time interface to the full QueueService.
 */

import { useState, useEffect, useCallback } from 'react';
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
  schedule: QueueEntry[];
}

interface UseQueueServiceOptions {
  staffId?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function useQueueService(options: UseQueueServiceOptions) {
  const { staffId, autoRefresh = true, refreshInterval } = options;

  const [scheduleData, setScheduleData] = useState<ScheduleData>({ operatingMode: 'none', schedule: [] });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  
  const [queueService] = useState(() => new QueueService());
  const { toast } = useToast();

  const refreshSchedule = useCallback(async () => {
    if (!staffId) {
      setIsLoading(false);
      setScheduleData({ operatingMode: 'none', schedule: [] });
      return;
    }
    setIsLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const data = await queueService.getDailySchedule(staffId, today);
      setScheduleData(data);
      setError(null);
    } catch (err) {
      const error = err as Error;
      setError(error);
      logger.error('Failed to refresh schedule', error, { staffId });
    } finally {
      setIsLoading(false);
    }
  }, [staffId, queueService]);

  useEffect(() => { refreshSchedule(); }, [refreshSchedule]);

  useEffect(() => {
    if (!autoRefresh) return;
    const handler = () => { logger.debug('Refresh triggered by event'); refreshSchedule(); };
    const events: QueueEventType[] = [
      QueueEventType.PATIENT_ADDED_TO_QUEUE,
      QueueEventType.APPOINTMENT_STATUS_CHANGED,
      QueueEventType.PATIENT_RETURNED,
      QueueEventType.PATIENT_MARKED_ABSENT,
      QueueEventType.QUEUE_POSITION_CHANGED
    ];
    const subscriptions = events.map(event => eventBus.subscribe(event, handler));
    return () => subscriptions.forEach(unsub => unsub());
  }, [autoRefresh, refreshSchedule]);

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


  return {
    isLoading,
    error,
    operatingMode: scheduleData.operatingMode,
    schedule: scheduleData.schedule,
    refreshSchedule,
    createAppointment,
    checkInPatient,
    callNextPatient,
    markPatientAbsent,
    markPatientReturned,
    completeAppointment,
    reorderQueue,
  };
}