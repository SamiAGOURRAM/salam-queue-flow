# 🛠️ Implementation Guide
## Step-by-Step Service Layer Implementation

**Date**: October 15, 2025  
**Version**: 1.0.0  
**Target**: Modular Monolithic Architecture with Service Layer

---

## 🎯 Implementation Strategy

### Approach: **Gradual Refactoring (Strangler Fig Pattern)**

We will **NOT** do a big-bang rewrite. Instead:
1. ✅ Create service layer **alongside** existing code
2. ✅ Migrate one feature at a time
3. ✅ Keep system working at all times
4. ✅ Add tests as we go

---

## 📋 Phase 1: Service Layer Foundation

### Step 1.1: Directory Structure

Create the following structure:

```bash
mkdir -p src/services/{queue,notification,clinic,appointment,auth,shared}
mkdir -p src/services/queue/{models,events,repositories,api}
mkdir -p src/services/notification/{channels,templates}
mkdir -p src/services/shared/{events,logging,validation,errors}
```

### Step 1.2: Shared Infrastructure

#### Error Classes

```typescript
// src/services/shared/errors/AppError.ts
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super(`${entity} with id ${id} not found`, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export class BusinessRuleViolationError extends AppError {
  constructor(message: string) {
    super(message, 'BUSINESS_RULE_VIOLATION', 422);
  }
}
```

#### Logger

```typescript
// src/services/shared/logging/Logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: any;
}

export class Logger {
  constructor(private context: string) {}

  debug(message: string, data?: LogContext) {
    this.log('debug', message, data);
  }

  info(message: string, data?: LogContext) {
    this.log('info', message, data);
  }

  warn(message: string, data?: LogContext) {
    this.log('warn', message, data);
  }

  error(message: string, error?: Error, data?: LogContext) {
    this.log('error', message, {
      ...data,
      error: error?.message,
      stack: error?.stack,
    });
  }

  private log(level: LogLevel, message: string, data?: LogContext) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      context: this.context,
      message,
      ...data,
    };

    // In development: pretty print
    if (import.meta.env.DEV) {
      console[level === 'debug' ? 'log' : level](
        `[${level.toUpperCase()}] ${this.context}: ${message}`,
        data || ''
      );
    } else {
      // In production: structured JSON
      console.log(JSON.stringify(logEntry));
    }
  }
}

// Factory function
export const createLogger = (context: string) => new Logger(context);
```

#### Event Bus

```typescript
// src/services/shared/events/EventBus.ts
export interface DomainEvent {
  eventName: string;
  occurredAt: Date;
  data: any;
}

type EventHandler = (event: DomainEvent) => void | Promise<void>;

export class EventBus {
  private handlers = new Map<string, EventHandler[]>();
  private logger = createLogger('EventBus');

  subscribe(eventName: string, handler: EventHandler): () => void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }

    this.handlers.get(eventName)!.push(handler);
    this.logger.debug(`Subscribed to event: ${eventName}`);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(eventName);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  async publish(event: DomainEvent): Promise<void> {
    this.logger.info(`Publishing event: ${event.eventName}`, {
      data: event.data,
    });

    const handlers = this.handlers.get(event.eventName) || [];

    // Execute handlers in parallel
    await Promise.all(
      handlers.map(async (handler) => {
        try {
          await handler(event);
        } catch (error) {
          this.logger.error(
            `Error in event handler for ${event.eventName}`,
            error as Error,
            { event }
          );
          // Don't throw - we don't want one handler failure to affect others
        }
      })
    );
  }
}

// Singleton instance
export const eventBus = new EventBus();
```

### Step 1.3: Domain Events

```typescript
// src/services/queue/events/QueueEvents.ts
import { DomainEvent } from '@/services/shared/events/EventBus';

export class PatientCalledEvent implements DomainEvent {
  readonly eventName = 'patient.called';
  readonly occurredAt = new Date();

  constructor(
    public data: {
      appointmentId: string;
      patientId: string;
      patientName: string;
      clinicId: string;
      staffId: string;
      queuePosition: number;
    }
  ) {}
}

export class PatientMarkedAbsentEvent implements DomainEvent {
  readonly eventName = 'patient.marked_absent';
  readonly occurredAt = new Date();

  constructor(
    public data: {
      appointmentId: string;
      patientId: string;
      clinicId: string;
      staffId: string;
      reason: string;
      gracePeriodEndsAt: Date;
    }
  ) {}
}

export class PatientReturnedEvent implements DomainEvent {
  readonly eventName = 'patient.returned';
  readonly occurredAt = new Date();

  constructor(
    public data: {
      appointmentId: string;
      patientId: string;
      clinicId: string;
      newPosition: number;
    }
  ) {}
}

export class QueueUpdatedEvent implements DomainEvent {
  readonly eventName = 'queue.updated';
  readonly occurredAt = new Date();

  constructor(
    public data: {
      clinicId: string;
      queueLength: number;
      averageWaitTime: number;
    }
  ) {}
}
```

### Step 1.4: Repository Pattern

```typescript
// src/services/queue/repositories/QueueRepository.ts
import { supabase } from '@/integrations/supabase/client';
import { createLogger } from '@/services/shared/logging/Logger';
import { NotFoundError } from '@/services/shared/errors/AppError';

export interface QueuePatientData {
  id: string;
  patient_id: string;
  clinic_id: string;
  queue_position: number | null;
  status: string;
  predicted_start_time: string | null;
  is_present: boolean;
  marked_absent_at: string | null;
  appointment_type: string;
  actual_start_time: string | null;
  skip_count: number;
  patient_name: string;
  phone_number: string;
  preferred_language: string;
}

export class QueueRepository {
  private logger = createLogger('QueueRepository');

  async getActiveQueue(clinicId: string, date: string): Promise<QueuePatientData[]> {
    this.logger.debug('Fetching active queue', { clinicId, date });

    const { data, error } = await supabase
      .from('appointments')
      .select(`
        id,
        patient_id,
        clinic_id,
        queue_position,
        status,
        predicted_start_time,
        is_present,
        marked_absent_at,
        appointment_type,
        actual_start_time,
        skip_count,
        profiles:patient_id(full_name, phone_number, preferred_language)
      `)
      .eq('clinic_id', clinicId)
      .eq('appointment_date', date)
      .in('status', ['scheduled', 'waiting', 'in_progress'])
      .order('queue_position', { ascending: true, nullsFirst: false });

    if (error) {
      this.logger.error('Error fetching queue', error);
      throw error;
    }

    // Transform data
    return (data || []).map(apt => ({
      ...apt,
      patient_name: apt.profiles?.full_name || 'Unknown',
      phone_number: apt.profiles?.phone_number || '',
      preferred_language: apt.profiles?.preferred_language || 'en',
    }));
  }

  async getCurrentPatient(clinicId: string, date: string): Promise<QueuePatientData | null> {
    const { data, error } = await supabase
      .from('appointments')
      .select(`
        id,
        patient_id,
        clinic_id,
        queue_position,
        status,
        predicted_start_time,
        is_present,
        marked_absent_at,
        appointment_type,
        actual_start_time,
        skip_count,
        profiles:patient_id(full_name, phone_number, preferred_language)
      `)
      .eq('clinic_id', clinicId)
      .eq('appointment_date', date)
      .eq('status', 'in_progress')
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      this.logger.error('Error fetching current patient', error);
      throw error;
    }

    if (!data) return null;

    return {
      ...data,
      patient_name: data.profiles?.full_name || 'Unknown',
      phone_number: data.profiles?.phone_number || '',
      preferred_language: data.profiles?.preferred_language || 'en',
    };
  }

  async getAbsentPatients(clinicId: string, date: string): Promise<QueuePatientData[]> {
    const { data, error } = await supabase
      .from('absent_patients')
      .select(`
        appointment_id,
        grace_period_ends_at,
        new_position,
        appointments:appointment_id(
          id,
          patient_id,
          clinic_id,
          queue_position,
          status,
          appointment_type,
          profiles:patient_id(full_name, phone_number, preferred_language)
        )
      `)
      .eq('clinic_id', clinicId)
      .is('returned_at', null)
      .eq('auto_cancelled', false);

    if (error) {
      this.logger.error('Error fetching absent patients', error);
      throw error;
    }

    return (data || []).map(absent => ({
      ...absent.appointments,
      grace_period_ends_at: absent.grace_period_ends_at,
      new_position: absent.new_position,
      patient_name: absent.appointments.profiles?.full_name || 'Unknown',
      phone_number: absent.appointments.profiles?.phone_number || '',
      preferred_language: absent.appointments.profiles?.preferred_language || 'en',
    }));
  }

  async updateAppointmentStatus(
    appointmentId: string,
    updates: Partial<{
      status: string;
      is_present: boolean;
      marked_absent_at: string;
      actual_start_time: string;
      actual_end_time: string;
      skip_count: number;
    }>
  ): Promise<void> {
    const { error } = await supabase
      .from('appointments')
      .update(updates)
      .eq('id', appointmentId);

    if (error) {
      this.logger.error('Error updating appointment', error, { appointmentId });
      throw error;
    }
  }

  async createAbsentRecord(data: {
    appointment_id: string;
    clinic_id: string;
    patient_id: string;
    grace_period_ends_at: string;
  }): Promise<void> {
    const { error } = await supabase
      .from('absent_patients')
      .insert(data);

    if (error) {
      this.logger.error('Error creating absent record', error);
      throw error;
    }
  }

  async createQueueOverride(data: {
    clinic_id: string;
    appointment_id: string;
    action_type: string;
    performed_by: string;
    reason?: string;
    previous_position?: number;
    new_position?: number;
    skipped_patient_ids?: string[];
  }): Promise<void> {
    const { error } = await supabase
      .from('queue_overrides')
      .insert(data);

    if (error) {
      this.logger.error('Error creating queue override', error);
      throw error;
    }
  }
}
```

---

## 📦 Phase 2: Queue Service Implementation

### Step 2.1: Queue Service

```typescript
// src/services/queue/QueueService.ts
import { QueueRepository, QueuePatientData } from './repositories/QueueRepository';
import { eventBus } from '@/services/shared/events/EventBus';
import {
  PatientCalledEvent,
  PatientMarkedAbsentEvent,
  PatientReturnedEvent,
  QueueUpdatedEvent,
} from './events/QueueEvents';
import { createLogger } from '@/services/shared/logging/Logger';
import { BusinessRuleViolationError, NotFoundError } from '@/services/shared/errors/AppError';
import { supabase } from '@/integrations/supabase/client';

export interface QueueStatus {
  currentPatient: QueuePatientData | null;
  waitingPatients: QueuePatientData[];
  absentPatients: QueuePatientData[];
  statistics: {
    totalWaiting: number;
    averageWaitTime: number;
    longestWaitTime: number;
  };
}

export class QueueService {
  private repository: QueueRepository;
  private logger = createLogger('QueueService');

  constructor() {
    this.repository = new QueueRepository();
  }

  /**
   * Get current queue status for a clinic
   */
  async getQueueStatus(clinicId: string): Promise<QueueStatus> {
    const today = new Date().toISOString().split('T')[0];

    this.logger.debug('Getting queue status', { clinicId, date: today });

    const [currentPatient, waitingPatients, absentPatients] = await Promise.all([
      this.repository.getCurrentPatient(clinicId, today),
      this.repository.getActiveQueue(clinicId, today),
      this.repository.getAbsentPatients(clinicId, today),
    ]);

    // Calculate statistics
    const statistics = this.calculateStatistics(waitingPatients);

    return {
      currentPatient,
      waitingPatients: waitingPatients.filter(p => p.status !== 'in_progress'),
      absentPatients,
      statistics,
    };
  }

  /**
   * Call next patient in queue
   * Business Rules:
   * 1. Only call present patients
   * 2. Skip absent patients
   * 3. Increment skip count for bypassed patients
   * 4. Create audit trail
   */
  async callNextPatient(clinicId: string, staffId: string): Promise<QueuePatientData> {
    this.logger.info('Calling next patient', { clinicId, staffId });

    const today = new Date().toISOString().split('T')[0];
    const queue = await this.repository.getActiveQueue(clinicId, today);

    // Business Rule: Find next present patient
    const presentPatients = queue.filter(p => p.is_present && p.status === 'waiting');

    if (presentPatients.length === 0) {
      throw new BusinessRuleViolationError('No present patients in queue');
    }

    const nextPatient = presentPatients[0];

    // Business Rule: Increment skip count for bypassed patients
    const skippedPatients = queue
      .slice(0, queue.indexOf(nextPatient))
      .filter(p => p.is_present && p.status === 'waiting');

    // Update database via Edge Function (for now)
    const { data, error } = await supabase.functions.invoke('smart-queue-manager', {
      body: {
        action: 'call_present',
        clinic_id: clinicId,
        appointment_id: nextPatient.id,
        performed_by: staffId,
      },
    });

    if (error) {
      this.logger.error('Error calling patient', error);
      throw error;
    }

    // Publish event
    await eventBus.publish(
      new PatientCalledEvent({
        appointmentId: nextPatient.id,
        patientId: nextPatient.patient_id,
        patientName: nextPatient.patient_name,
        clinicId,
        staffId,
        queuePosition: nextPatient.queue_position || 0,
      })
    );

    this.logger.info('Patient called successfully', {
      appointmentId: nextPatient.id,
      skippedCount: skippedPatients.length,
    });

    return nextPatient;
  }

  /**
   * Mark patient as absent with grace period
   */
  async markPatientAbsent(
    appointmentId: string,
    clinicId: string,
    staffId: string,
    reason: string = 'Not present when called'
  ): Promise<void> {
    this.logger.info('Marking patient absent', { appointmentId, reason });

    // Call Edge Function
    const { data, error } = await supabase.functions.invoke('smart-queue-manager', {
      body: {
        action: 'mark_absent',
        clinic_id: clinicId,
        appointment_id: appointmentId,
        performed_by: staffId,
        reason,
      },
    });

    if (error) {
      this.logger.error('Error marking patient absent', error);
      throw error;
    }

    // Publish event
    await eventBus.publish(
      new PatientMarkedAbsentEvent({
        appointmentId,
        patientId: data.patient_id,
        clinicId,
        staffId,
        reason,
        gracePeriodEndsAt: new Date(data.grace_period_ends_at),
      })
    );

    this.logger.info('Patient marked absent', { appointmentId });
  }

  /**
   * Handle late arrival (patient returns during grace period)
   */
  async handleLateArrival(
    appointmentId: string,
    clinicId: string,
    staffId: string
  ): Promise<{ newPosition: number }> {
    this.logger.info('Handling late arrival', { appointmentId });

    const { data, error } = await supabase.functions.invoke('smart-queue-manager', {
      body: {
        action: 'late_arrival',
        clinic_id: clinicId,
        appointment_id: appointmentId,
        performed_by: staffId,
      },
    });

    if (error) {
      this.logger.error('Error handling late arrival', error);
      throw error;
    }

    // Publish event
    await eventBus.publish(
      new PatientReturnedEvent({
        appointmentId,
        patientId: data.patient_id,
        clinicId,
        newPosition: data.new_position,
      })
    );

    return { newPosition: data.new_position };
  }

  /**
   * Complete current patient consultation
   */
  async completeCurrentPatient(clinicId: string, staffId: string): Promise<void> {
    this.logger.info('Completing current patient', { clinicId });

    const { error } = await supabase.functions.invoke('smart-queue-manager', {
      body: {
        action: 'complete_current',
        clinic_id: clinicId,
        performed_by: staffId,
      },
    });

    if (error) {
      this.logger.error('Error completing patient', error);
      throw error;
    }

    // Publish queue updated event
    const status = await this.getQueueStatus(clinicId);
    await eventBus.publish(
      new QueueUpdatedEvent({
        clinicId,
        queueLength: status.waitingPatients.length,
        averageWaitTime: status.statistics.averageWaitTime,
      })
    );
  }

  private calculateStatistics(patients: QueuePatientData[]) {
    const waiting = patients.filter(p => p.status === 'waiting');

    return {
      totalWaiting: waiting.length,
      averageWaitTime: 15, // TODO: Calculate from predicted times
      longestWaitTime: 30, // TODO: Calculate from actual wait
    };
  }
}

// Singleton instance
export const queueService = new QueueService();
```

### Step 2.2: React Hook for Queue Service

```typescript
// src/hooks/useQueueService.ts
import { useState, useEffect, useCallback } from 'react';
import { queueService, QueueStatus } from '@/services/queue/QueueService';
import { useToast } from './use-toast';
import { supabase } from '@/integrations/supabase/client';

export function useQueueService(clinicId: string) {
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { toast } = useToast();

  // Load queue status
  const loadQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const status = await queueService.getQueueStatus(clinicId);
      setQueueStatus(status);
    } catch (err) {
      setError(err as Error);
      toast({
        title: 'Error',
        description: 'Failed to load queue status',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [clinicId, toast]);

  // Subscribe to real-time updates
  useEffect(() => {
    loadQueue();

    const subscription = supabase
      .channel(`queue:${clinicId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `clinic_id=eq.${clinicId}`,
        },
        () => {
          loadQueue();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [clinicId, loadQueue]);

  // Actions
  const callNextPatient = useCallback(
    async (staffId: string) => {
      try {
        await queueService.callNextPatient(clinicId, staffId);
        toast({
          title: 'Success',
          description: 'Patient called successfully',
        });
        await loadQueue();
      } catch (err) {
        toast({
          title: 'Error',
          description: (err as Error).message,
          variant: 'destructive',
        });
        throw err;
      }
    },
    [clinicId, toast, loadQueue]
  );

  const markPatientAbsent = useCallback(
    async (appointmentId: string, staffId: string, reason?: string) => {
      try {
        await queueService.markPatientAbsent(appointmentId, clinicId, staffId, reason);
        toast({
          title: 'Success',
          description: 'Patient marked as absent',
        });
        await loadQueue();
      } catch (err) {
        toast({
          title: 'Error',
          description: (err as Error).message,
          variant: 'destructive',
        });
        throw err;
      }
    },
    [clinicId, toast, loadQueue]
  );

  const handleLateArrival = useCallback(
    async (appointmentId: string, staffId: string) => {
      try {
        const result = await queueService.handleLateArrival(appointmentId, clinicId, staffId);
        toast({
          title: 'Success',
          description: `Patient re-queued at position ${result.newPosition}`,
        });
        await loadQueue();
      } catch (err) {
        toast({
          title: 'Error',
          description: (err as Error).message,
          variant: 'destructive',
        });
        throw err;
      }
    },
    [clinicId, toast, loadQueue]
  );

  const completeCurrentPatient = useCallback(
    async (staffId: string) => {
      try {
        await queueService.completeCurrentPatient(clinicId, staffId);
        toast({
          title: 'Success',
          description: 'Patient consultation completed',
        });
        await loadQueue();
      } catch (err) {
        toast({
          title: 'Error',
          description: (err as Error).message,
          variant: 'destructive',
        });
        throw err;
      }
    },
    [clinicId, toast, loadQueue]
  );

  return {
    queueStatus,
    loading,
    error,
    actions: {
      callNextPatient,
      markPatientAbsent,
      handleLateArrival,
      completeCurrentPatient,
      refresh: loadQueue,
    },
  };
}
```

### Step 2.3: Update Component to Use Service

```typescript
// src/components/clinic/QueueManager.tsx (NEW - Simplified)
import { useQueueService } from '@/hooks/useQueueService';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function QueueManager({ clinicId }: { clinicId: string }) {
  const { user } = useAuth();
  const { queueStatus, loading, actions } = useQueueService(clinicId);

  if (loading) return <div>Loading...</div>;
  if (!queueStatus) return <div>No queue data</div>;

  return (
    <div className="space-y-4">
      {/* Current Patient */}
      {queueStatus.currentPatient && (
        <Card className="p-4">
          <h3>Current Patient</h3>
          <p>{queueStatus.currentPatient.patient_name}</p>
          <Button onClick={() => actions.completeCurrentPatient(user!.id)}>
            Complete
          </Button>
        </Card>
      )}

      {/* Waiting Patients */}
      <Card className="p-4">
        <h3>Queue ({queueStatus.statistics.totalWaiting})</h3>
        {queueStatus.waitingPatients.map((patient) => (
          <div key={patient.id} className="flex justify-between">
            <span>{patient.patient_name}</span>
            <div>
              <Button
                size="sm"
                onClick={() => actions.callNextPatient(user!.id)}
              >
                Call
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() =>
                  actions.markPatientAbsent(patient.id, user!.id)
                }
              >
                Absent
              </Button>
            </div>
          </div>
        ))}
      </Card>

      {/* Absent Patients */}
      {queueStatus.absentPatients.length > 0 && (
        <Card className="p-4">
          <h3>Absent Patients</h3>
          {queueStatus.absentPatients.map((patient) => (
            <div key={patient.id}>
              <span>{patient.patient_name}</span>
              <Button
                size="sm"
                onClick={() => actions.handleLateArrival(patient.id, user!.id)}
              >
                Returned
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
```

---

## 🧪 Phase 3: Testing

### Step 3.1: Setup Vitest

```bash
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

```typescript
// src/test/setup.ts
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    })),
  },
}));
```

### Step 3.2: Unit Tests

```typescript
// src/services/queue/QueueService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueueService } from './QueueService';
import { supabase } from '@/integrations/supabase/client';

describe('QueueService', () => {
  let service: QueueService;

  beforeEach(() => {
    service = new QueueService();
    vi.clearAllMocks();
  });

  describe('getQueueStatus', () => {
    it('should return queue status with patients', async () => {
      // Mock data
      const mockPatients = [
        {
          id: '1',
          patient_id: 'p1',
          patient_name: 'John Doe',
          status: 'waiting',
          is_present: true,
          queue_position: 1,
        },
      ];

      // Mock repository
      vi.spyOn(service['repository'], 'getActiveQueue').mockResolvedValue(
        mockPatients as any
      );
      vi.spyOn(service['repository'], 'getCurrentPatient').mockResolvedValue(null);
      vi.spyOn(service['repository'], 'getAbsentPatients').mockResolvedValue([]);

      const status = await service.getQueueStatus('clinic-123');

      expect(status.waitingPatients).toHaveLength(1);
      expect(status.currentPatient).toBeNull();
      expect(status.statistics.totalWaiting).toBe(1);
    });
  });

  describe('callNextPatient', () => {
    it('should call next present patient', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({
        data: { patient_id: 'p1' },
        error: null,
      });
      (supabase.functions.invoke as any) = mockInvoke;

      vi.spyOn(service['repository'], 'getActiveQueue').mockResolvedValue([
        {
          id: '1',
          patient_id: 'p1',
          is_present: true,
          status: 'waiting',
        } as any,
      ]);

      await service.callNextPatient('clinic-123', 'staff-1');

      expect(mockInvoke).toHaveBeenCalledWith('smart-queue-manager', {
        body: expect.objectContaining({
          action: 'call_present',
        }),
      });
    });

    it('should throw error if no present patients', async () => {
      vi.spyOn(service['repository'], 'getActiveQueue').mockResolvedValue([
        {
          id: '1',
          is_present: false,
          status: 'waiting',
        } as any,
      ]);

      await expect(
        service.callNextPatient('clinic-123', 'staff-1')
      ).rejects.toThrow('No present patients in queue');
    });
  });
});
```

---

## 📡 Phase 4: API Layer (Future)

### Step 4.1: API Routes Structure

```typescript
// src/api/v1/index.ts (Future Express/Hono server)
import { Hono } from 'hono';
import { queueRoutes } from './routes/queue';
import { appointmentRoutes } from './routes/appointments';
import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './middleware/logger';

const app = new Hono();

// Global middleware
app.use('*', logger);
app.use('/api/*', authMiddleware);

// Routes
app.route('/api/v1/queue', queueRoutes);
app.route('/api/v1/appointments', appointmentRoutes);

// Error handling
app.onError(errorHandler);

export default app;
```

```typescript
// src/api/v1/routes/queue.ts
import { Hono } from 'hono';
import { queueService } from '@/services/queue/QueueService';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const app = new Hono();

const CallNextSchema = z.object({
  staffId: z.string().uuid(),
});

// GET /api/v1/queue/:clinicId
app.get('/:clinicId', async (c) => {
  const clinicId = c.req.param('clinicId');
  const status = await queueService.getQueueStatus(clinicId);
  return c.json(status);
});

// POST /api/v1/queue/:clinicId/call-next
app.post(
  '/:clinicId/call-next',
  zValidator('json', CallNextSchema),
  async (c) => {
    const clinicId = c.req.param('clinicId');
    const { staffId } = c.req.valid('json');

    const patient = await queueService.callNextPatient(clinicId, staffId);
    return c.json({ success: true, patient });
  }
);

export const queueRoutes = app;
```

---

## 📝 Next Actions Checklist

### Week 1 (Foundation)
- [ ] Create `src/services/` directory structure
- [ ] Implement shared utilities (Logger, EventBus, Errors)
- [ ] Create QueueRepository
- [ ] Write tests for repository
- [ ] Document patterns

### Week 2 (Queue Service)
- [ ] Implement QueueService
- [ ] Create domain events
- [ ] Write unit tests for QueueService
- [ ] Create useQueueService hook
- [ ] Update one component to use service

### Week 3 (Expand Services)
- [ ] Create NotificationService
- [ ] Create ClinicService
- [ ] Create AppointmentService
- [ ] Write tests for all services
- [ ] Update remaining components

### Week 4 (Testing & Documentation)
- [ ] Achieve 80% test coverage
- [ ] Write integration tests
- [ ] Document all APIs
- [ ] Create developer guide

---

## 🎓 Best Practices

### 1. Always Use Services
```typescript
// ❌ Bad: Direct database access
const { data } = await supabase.from('appointments').select('*');

// ✅ Good: Use service layer
const queue = await queueService.getQueueStatus(clinicId);
```

### 2. Handle Errors Properly
```typescript
// ❌ Bad: Silent failure
try {
  await queueService.callNextPatient(clinicId, staffId);
} catch (err) {
  // Nothing
}

// ✅ Good: Log and notify
try {
  await queueService.callNextPatient(clinicId, staffId);
} catch (err) {
  logger.error('Failed to call patient', err);
  toast({ title: 'Error', description: err.message });
  throw err; // Re-throw if needed
}
```

### 3. Use Domain Events
```typescript
// ❌ Bad: Tight coupling
async callPatient() {
  await updateDatabase();
  await sendSMS(); // Direct dependency
  await updateCache(); // Another dependency
}

// ✅ Good: Publish event
async callPatient() {
  await updateDatabase();
  await eventBus.publish(new PatientCalledEvent(...));
  // Other services listen and react
}
```

---

**Status**: Ready for Implementation  
**Estimated Time**: 4-6 weeks  
**Team Size**: 2-3 developers
