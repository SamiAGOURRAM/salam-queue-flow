/**
 * useQueueService Hook
 * React hook for accessing QueueService with reactive state management
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { QueueService } from '../services/queue/QueueService';
import { eventBus } from '../services/shared/events/EventBus';
import { logger } from '../services/shared/logging/Logger';
import { useToast } from './use-toast';
import {
  QueueEntry,
  QueueFilters,
  QueueSummary,
  CreateQueueEntryDTO,
  MarkAbsentDTO,
  CallNextPatientDTO,
  ReorderQueueDTO,
  AppointmentStatus,
} from '../services/queue/models/QueueModels';
import { QueueEventType } from '../services/queue/events/QueueEvents';

interface UseQueueServiceOptions {
  clinicId: string;
  date: Date;
  autoRefresh?: boolean; // Auto-refresh on events
  refreshInterval?: number; // Polling interval in ms (optional)
}

interface UseQueueServiceReturn {
  // State
  queue: QueueEntry[];
  summary: QueueSummary | null;
  isLoading: boolean;
  error: Error | null;
  
  // Actions
  refreshQueue: () => Promise<void>;
  addToQueue: (dto: Omit<CreateQueueEntryDTO, 'clinicId'>) => Promise<QueueEntry>;
  checkInPatient: (appointmentId: string) => Promise<QueueEntry>;
  callNextPatient: (performedBy: string) => Promise<QueueEntry>;
  markPatientAbsent: (dto: Omit<MarkAbsentDTO, 'clinicId'>) => Promise<QueueEntry>;
  markPatientReturned: (appointmentId: string, performedBy: string) => Promise<QueueEntry>;
  completeAppointment: (appointmentId: string, performedBy: string) => Promise<QueueEntry>;
  reorderQueue: (dto: ReorderQueueDTO) => Promise<QueueEntry>;
}

export function useQueueService(options: UseQueueServiceOptions): UseQueueServiceReturn {
  const { clinicId, date, autoRefresh = true, refreshInterval } = options;
  
  // Convert date to timestamp to avoid re-render issues with Date objects
  const dateTimestamp = date.getTime();
  
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  
  const serviceRef = useRef<QueueService>(new QueueService());
  const { toast } = useToast();

  // ============================================
  // QUEUE FETCHING
  // ============================================

  const refreshQueue = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Create start and end of day from the provided date
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const filters: QueueFilters = {
        clinicId,
        startDate: startOfDay.toISOString(),
        endDate: endOfDay.toISOString(),
        status: [
          AppointmentStatus.SCHEDULED,
          AppointmentStatus.WAITING,
          AppointmentStatus.IN_PROGRESS,
        ],
      };

      const [queueData, summaryData] = await Promise.all([
        serviceRef.current.getQueue(filters),
        serviceRef.current.getQueueSummary(clinicId, date),
      ]);

      setQueue(queueData);
      setSummary(summaryData);
      logger.debug('Queue data refreshed', { 
        queueLength: queueData.length,
        clinicId,
        date 
      });
    } catch (err) {
      const error = err as Error;
      setError(error);
      logger.error('Failed to refresh queue', error, { clinicId, date });
      toast({
        title: 'Error',
        description: 'Failed to load queue data. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [clinicId, dateTimestamp, toast]);

  // ============================================
  // QUEUE ACTIONS
  // ============================================

  const addToQueue = useCallback(async (
    dto: Omit<CreateQueueEntryDTO, 'clinicId'>
  ): Promise<QueueEntry> => {
    try {
      const entry = await serviceRef.current.addToQueue({
        ...dto,
        clinicId,
      });

      toast({
        title: 'Patient Added',
        description: `Patient added to queue at position ${entry.queuePosition}`,
      });

      // Refresh queue after adding
      await refreshQueue();
      
      return entry;
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to add patient to queue', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add patient to queue',
        variant: 'destructive',
      });
      throw error;
    }
  }, [clinicId, toast, refreshQueue]);

  const checkInPatient = useCallback(async (appointmentId: string): Promise<QueueEntry> => {
    try {
      const entry = await serviceRef.current.checkInPatient(appointmentId);
      
      toast({
        title: 'Patient Checked In',
        description: 'Patient has been marked as present',
      });

      await refreshQueue();
      return entry;
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to check in patient', error, { appointmentId });
      toast({
        title: 'Error',
        description: error.message || 'Failed to check in patient',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast, refreshQueue]);

  const callNextPatient = useCallback(async (performedBy: string): Promise<QueueEntry> => {
    try {
      const dto: CallNextPatientDTO = {
        clinicId,
        date,
        performedBy,
        skipAbsentPatients: true,
      };

      const entry = await serviceRef.current.callNextPatient(dto);
      
      toast({
        title: 'Next Patient Called',
        description: `Patient at position ${entry.queuePosition} has been called`,
      });

      await refreshQueue();
      return entry;
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to call next patient', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to call next patient',
        variant: 'destructive',
      });
      throw error;
    }
  }, [clinicId, date, toast, refreshQueue]);

  const markPatientAbsent = useCallback(async (
    dto: Omit<MarkAbsentDTO, 'clinicId'>
  ): Promise<QueueEntry> => {
    try {
      const entry = await serviceRef.current.markPatientAbsent(dto);
      
      toast({
        title: 'Patient Marked Absent',
        description: 'Patient will be moved to the end of the queue when they return',
      });

      await refreshQueue();
      return entry;
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to mark patient absent', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to mark patient absent',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast, refreshQueue]);

  const markPatientReturned = useCallback(async (
    appointmentId: string,
    performedBy: string
  ): Promise<QueueEntry> => {
    try {
      const entry = await serviceRef.current.markPatientReturned(appointmentId, performedBy);
      
      toast({
        title: 'Patient Returned',
        description: `Patient has been placed at position ${entry.queuePosition}`,
      });

      await refreshQueue();
      return entry;
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to mark patient as returned', error, { appointmentId });
      toast({
        title: 'Error',
        description: error.message || 'Failed to mark patient as returned',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast, refreshQueue]);

  const completeAppointment = useCallback(async (
    appointmentId: string,
    performedBy: string
  ): Promise<QueueEntry> => {
    try {
      const entry = await serviceRef.current.completeAppointment(appointmentId, performedBy);
      
      toast({
        title: 'Appointment Completed',
        description: 'The appointment has been marked as completed',
      });

      await refreshQueue();
      return entry;
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to complete appointment', error, { appointmentId });
      toast({
        title: 'Error',
        description: error.message || 'Failed to complete appointment',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast, refreshQueue]);

  const reorderQueue = useCallback(async (dto: ReorderQueueDTO): Promise<QueueEntry> => {
    try {
      const entry = await serviceRef.current.reorderQueue(dto);
      
      toast({
        title: 'Queue Reordered',
        description: `Patient moved to position ${entry.queuePosition}`,
      });

      await refreshQueue();
      return entry;
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to reorder queue', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to reorder queue',
        variant: 'destructive',
      });
      throw error;
    }
  }, [toast, refreshQueue]);

  // ============================================
  // REAL-TIME UPDATES
  // ============================================

  useEffect(() => {
    if (!autoRefresh) return;

    // Subscribe to queue events for real-time updates
    const unsubscribers = [
      eventBus.subscribe(QueueEventType.PATIENT_ADDED_TO_QUEUE, () => {
        logger.debug('Queue event received: Patient added');
        refreshQueue();
      }),
      eventBus.subscribe(QueueEventType.PATIENT_CALLED, () => {
        logger.debug('Queue event received: Patient called');
        refreshQueue();
      }),
      eventBus.subscribe(QueueEventType.PATIENT_MARKED_ABSENT, () => {
        logger.debug('Queue event received: Patient marked absent');
        refreshQueue();
      }),
      eventBus.subscribe(QueueEventType.PATIENT_RETURNED, () => {
        logger.debug('Queue event received: Patient returned');
        refreshQueue();
      }),
      eventBus.subscribe(QueueEventType.QUEUE_POSITION_CHANGED, () => {
        logger.debug('Queue event received: Position changed');
        refreshQueue();
      }),
      eventBus.subscribe(QueueEventType.APPOINTMENT_STATUS_CHANGED, () => {
        logger.debug('Queue event received: Status changed');
        refreshQueue();
      }),
    ];

    return () => {
      // Cleanup subscriptions
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [autoRefresh]); // Remove refreshQueue from dependencies

  // ============================================
  // POLLING (Optional)
  // ============================================

  useEffect(() => {
    if (!refreshInterval) return;

    const intervalId = setInterval(() => {
      logger.debug('Polling queue data', { interval: refreshInterval });
      refreshQueue();
    }, refreshInterval);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshInterval]); // Remove refreshQueue from dependencies

  // ============================================
  // INITIAL LOAD
  // ============================================

  useEffect(() => {
    refreshQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, dateTimestamp]); // Only reload when clinic or date changes

  // ============================================
  // RETURN
  // ============================================

  return {
    queue,
    summary,
    isLoading,
    error,
    refreshQueue,
    addToQueue,
    checkInPatient,
    callNextPatient,
    markPatientAbsent,
    markPatientReturned,
    completeAppointment,
    reorderQueue,
  };
}
