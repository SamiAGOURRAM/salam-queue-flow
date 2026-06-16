/**
 * Queue Repository
 * Handles all data access for queue management
 * Abstracts Supabase implementation details
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import {
  QueueEntry,
  AbsentPatient,
  QueueOverride,
  AppointmentStatus,
  AppointmentType,
  SkipReason,
  QueueActionType,
  PaymentStatus,
  CreateQueueEntryDTO,
  UpdateQueueEntryDTO,
  UpdateAppointmentPaymentDTO,
  ClinicEstimationConfig,
  ClinicResourceAvailability,
  EstimationMode,
  QueueMode,
  WaitTimePredictionRecord,
  WaitTimeFeatureSnapshot,
  WaitTimeFeatureSnapshotInput,
  PublicQueueStatus,
  QueueBreakState,
} from '../models/QueueModels';
import { DatabaseError } from '../../shared/errors';
import { logger } from '../../shared/logging/Logger';

type PatientProfile = {
  id: string;
  user_id?: string | null;
  display_name?: string | null;
};

type ClinicInfo = {
  id: string;
  name?: string | null;
  specialty?: string | null;
  city?: string | null;
  address?: string | null;
  phone?: string | null; // clinics table uses 'phone', not 'phone_number'
  settings?: Record<string, unknown> | null;
  queue_mode?: string | null;
};

type RawAppointmentRow = {
  id: string;
  clinic_id: string;
  patient_id?: string | null;
  staff_id?: string | null;
  scheduled_time?: string | null;
  time_slot?: string | null;
  appointment_date?: string | null;
  queue_position?: number | null;
  status?: AppointmentStatus | null;
  appointment_type?: string | null;
  is_present?: boolean | null;
  marked_absent_at?: string | null;
  returned_at?: string | null;
  checked_in_at?: string | null;
  actual_end_time?: string | null;
  actual_duration?: number | null;
  estimated_duration?: number | null;
  predicted_wait_time?: number | null;
  prediction_confidence?: number | null;
  predicted_start_time?: string | null;
  last_prediction_update?: string | null;
  created_at: string;
  updated_at: string;
  original_queue_position?: number | null;
  skip_count?: number | null;
  skip_reason?: string | null;
  override_by?: string | null;
  is_walk_in?: boolean | null;
  patient?: PatientProfile | null;
  clinic?: ClinicInfo | null;
  priority_score?: number | null;
  is_gap_filler?: boolean | null;
  promoted_from_waitlist?: boolean | null;
  queue_status_token?: string | null;
  late_arrival_converted?: boolean | null;
  original_slot_time?: string | null;
  reason_for_visit?: string | null;
  billing_amount?: number | null;
  currency?: string | null;
  payment_status?: PaymentStatus | null;
  paid_at?: string | null;
  payment_method?: string | null;
  resource_id?: string | null;
  resource?: {
    id: string;
    name: string;
    resource_type: string;
  } | null;
};

type RawClinicResourceAvailabilityRow = {
  id: string;
  clinic_id: string;
  name: string;
  resource_type: string;
  capacity: number;
  display_order: number;
  is_active: boolean;
  notes?: string | null;
  is_occupied: boolean;
};

type RawAbsentPatientRow = {
  id: string;
  appointment_id: string;
  clinic_id: string;
  patient_id?: string | null;
  marked_absent_at: string;
  returned_at?: string | null;
  new_position?: number | null;
  notification_sent?: boolean | null;
  grace_period_ends_at?: string | null;
  auto_cancelled?: boolean | null;
  created_at: string;
  updated_at: string;
};

type RawQueueOverrideRow = {
  id: string;
  clinic_id: string;
  appointment_id: string;
  skipped_patient_ids?: string[] | null;
  action_type: QueueActionType | string;
  performed_by: string;
  reason?: string | null;
  previous_position?: number | null;
  new_position?: number | null;
  created_at: string;
};

type ClinicScheduleResponse = {
  queue_mode?: QueueMode;
  schedule?: RawAppointmentRow[] | null;
};

export class QueueRepository {
  /**
   * Get all queue entries for a clinic on a specific date
   * @param staffId - Staff ID (used to get clinic_id for now)
   * @param targetDate - Target date in YYYY-MM-DD format
   * @param useClinicWide - If true, shows all clinic appointments (default: true for now)
   */
  async getDailySchedule(
    staffId: string | undefined,
    targetDate: string,
    useClinicWide: boolean = true,
    allowedStaffIds?: string[],
    clinicId?: string
  ): Promise<{ queue_mode: QueueMode; schedule: QueueEntry[] }> {
    try {
      const normalizedAllowedStaffIds = Array.from(
        new Set((allowedStaffIds || []).filter((id): id is string => typeof id === 'string' && id.length > 0))
      );

      if (useClinicWide) {
        // ======= CLINIC-WIDE MODE (CURRENT) =======
        logger.debug('Fetching clinic-wide daily schedule', {
          staffId,
          clinicId,
          targetDate,
          allowedStaffCount: normalizedAllowedStaffIds.length,
        });

        let resolvedClinicId = clinicId;

        if (!resolvedClinicId && staffId) {
          const { data: staffRecord, error: staffError } = await supabase
            .from('clinic_staff')
            .select('clinic_id')
            .eq('id', staffId)
            .single();

          if (staffError || !staffRecord?.clinic_id) {
            logger.error('Failed to resolve clinic from staff record', staffError, { staffId });
            throw new DatabaseError(
              `Staff with ID ${staffId} not found or has no associated clinic`,
              staffError
            );
          }

          resolvedClinicId = staffRecord.clinic_id;
        }

        if (!resolvedClinicId) {
          throw new DatabaseError('Clinic-wide schedule requires clinicId or staffId context');
        }

        let data: unknown;
        let error: unknown;

        if (normalizedAllowedStaffIds.length > 0) {
          // Explicit staff IDs provided → use the multi‑doctor RPC directly.
          const result = await supabase.rpc('get_daily_schedule_for_doctors', {
            p_clinic_id: resolvedClinicId,
            p_target_date: targetDate,
            p_staff_ids: normalizedAllowedStaffIds,
          });
          data = result.data;
          error = result.error;
        } else {
          // No staff filter → try clinic‑wide scope first.  Provider roles
          // (doctor, etc.) are blocked by the backend with code 42501 when
          // they try the clinic‑wide RPC.  Fall back to their own provider
          // scope so the dashboard / queue page still works.
          const first = await supabase.rpc('get_daily_schedule_for_clinic', {
            p_clinic_id: resolvedClinicId,
            p_target_date: targetDate,
          });

          if (
            first.error &&
            first.error.code === '42501' &&
            staffId
          ) {
            logger.warn('Clinic‑wide scope denied for user; falling back to provider scope', {
              staffId,
              clinicId: resolvedClinicId,
              targetDate,
              originalError: first.error,
            });

            const fallback = await supabase.rpc('get_daily_schedule_for_doctors', {
              p_clinic_id: resolvedClinicId,
              p_target_date: targetDate,
              p_staff_ids: [staffId],
            });
            data = fallback.data;
            error = fallback.error;
          } else {
            data = first.data;
            error = first.error;
          }
        }

        if (error) {
          const cause = error instanceof Error
            ? error
            : new Error(String((error as { message?: unknown })?.message ?? error));
          logger.error('Failed to fetch clinic-wide schedule via RPC', cause, {
            staffId,
            targetDate,
            clinicId: resolvedClinicId,
            allowedStaffCount: normalizedAllowedStaffIds.length,
          });
          throw new DatabaseError('Failed to fetch schedule', cause);
        }

        return this.mapScheduleResponse(data);

      } else {
        // ======= STAFF-SPECIFIC MODE (FOR FUTURE) =======
        logger.debug('Fetching staff-specific daily schedule via RPC', { staffId, targetDate });

        if (!staffId) {
          throw new DatabaseError('Staff-specific schedule requires staffId context');
        }

        const { data, error } = await supabase.rpc('get_daily_schedule_for_staff', {
          p_staff_id: staffId,
          p_target_date: targetDate,
        });

        if (error) {
          logger.error('Failed to fetch staff schedule via RPC', error);
          throw new DatabaseError('Failed to fetch schedule', error);
        }

        return this.mapScheduleResponse(data);
      }

    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching daily schedule', error as Error);
      throw new DatabaseError('Unexpected error fetching daily schedule', error as Error);
    }
  }

  /**
   * Get clinic queue configuration (grace_period_minutes, etc.)
   */
  async getClinicQueueConfigByStaffId(staffId: string): Promise<{
    gracePeriodMinutes: number;
    allowOverflow: boolean;
    dailyCapacityLimit: number | null;
    settings?: Record<string, unknown> | null;
  } | null> {
    try {
      const { data: staffRecord, error: staffError } = await supabase
        .from('clinic_staff')
        .select('clinic_id')
        .eq('id', staffId)
        .single();

      if (staffError || !staffRecord?.clinic_id) {
        logger.warn('Clinic not found for staff', { staffId, error: staffError });
        return null;
      }

      // Get clinic config
      const { data, error } = await supabase
        .from('clinics')
        .select('grace_period_minutes, allow_overflow, daily_capacity_limit, settings')
        .eq('id', staffRecord.clinic_id)
        .single();

      if (error || !data) {
        logger.warn('Clinic queue config not found', { clinicId: staffRecord.clinic_id, error });
        return null;
      }

      return {
        gracePeriodMinutes: data.grace_period_minutes ?? 15, // Default 15 minutes
        allowOverflow: data.allow_overflow ?? false,
        dailyCapacityLimit: data.daily_capacity_limit ?? null,
        settings: data.settings as Record<string, unknown> | null,
      };
    } catch (error) {
      logger.warn('Failed to get clinic queue config', { error, staffId });
      return null;
    }
  }

  async startQueueBreak(
    clinicId: string,
    staffId: string,
    durationMinutes: number,
    performedBy: string,
    reason?: string,
    pushSchedule: boolean = true
  ): Promise<QueueBreakState> {
    try {
      const rpcClient = supabase as unknown as {
        rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown | null }>;
      };

      const { data, error } = await rpcClient.rpc('start_queue_break', {
        p_clinic_id: clinicId,
        p_staff_id: staffId,
        p_duration_minutes: durationMinutes,
        p_reason: reason ?? null,
        p_push_schedule: pushSchedule,
        p_performed_by: performedBy,
      });

      if (error || !data) {
        logger.error('Failed to start queue break via RPC', error as Error, {
          clinicId,
          staffId,
          durationMinutes,
        });
        throw new DatabaseError('Failed to start queue break', error as Error);
      }

      return this.mapToQueueBreakState(data);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error starting queue break', error as Error, {
        clinicId,
        staffId,
        durationMinutes,
      });
      throw new DatabaseError('Unexpected error starting queue break', error as Error);
    }
  }

  async endQueueBreak(
    clinicId: string,
    staffId: string,
    performedBy: string,
    reason?: string
  ): Promise<QueueBreakState | null> {
    try {
      const rpcClient = supabase as unknown as {
        rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown | null }>;
      };

      const { data, error } = await rpcClient.rpc('end_queue_break', {
        p_clinic_id: clinicId,
        p_staff_id: staffId,
        p_reason: reason ?? null,
        p_performed_by: performedBy,
      });

      if (error) {
        logger.error('Failed to end queue break via RPC', error as Error, {
          clinicId,
          staffId,
        });
        throw new DatabaseError('Failed to end queue break', error as Error);
      }

      if (!data) {
        return null;
      }

      return this.mapToQueueBreakState(data);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error ending queue break', error as Error, {
        clinicId,
        staffId,
      });
      throw new DatabaseError('Unexpected error ending queue break', error as Error);
    }
  }

  async getActiveQueueBreak(clinicId: string, staffId: string): Promise<QueueBreakState | null> {
    try {
      const rpcClient = supabase as unknown as {
        rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: unknown | null }>;
      };

      const { data, error } = await rpcClient.rpc('get_active_queue_break', {
        p_clinic_id: clinicId,
        p_staff_id: staffId,
      });

      if (error) {
        logger.error('Failed to fetch active queue break via RPC', error as Error, {
          clinicId,
          staffId,
        });
        throw new DatabaseError('Failed to fetch active queue break', error as Error);
      }

      if (!data) {
        return null;
      }

      return this.mapToQueueBreakState(data);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching active queue break', error as Error, {
        clinicId,
        staffId,
      });
      throw new DatabaseError('Unexpected error fetching active queue break', error as Error);
    }
  }

  async getClinicEstimationConfigByStaffId(staffId: string): Promise<ClinicEstimationConfig | null> {
    try {
      const { data: staffRecord, error: staffError } = await supabase
        .from('clinic_staff')
        .select('clinic_id')
        .eq('id', staffId)
        .single();

      if (staffError || !staffRecord?.clinic_id) {
        logger.warn('Clinic estimation config not found for staff', { staffId, error: staffError });
        return null;
      }

      const { data: clinic, error: clinicError } = await supabase
        .from('clinics')
        .select('id, settings, queue_mode, allow_overflow, daily_capacity_limit')
        .eq('id', staffRecord.clinic_id)
        .single();

      if (clinicError || !clinic) {
        logger.warn('Clinic estimation config not found for staff', { staffId, error: clinicError });
        return null;
      }

      const clinicData = clinic as {
        id: string;
        settings: Record<string, unknown> | null;
        queue_mode: string | null;
        allow_overflow: boolean | null;
        daily_capacity_limit: number | null;
      };

      const settings = clinicData.settings || {};
      const coerceNumber = (value: unknown): number | undefined => {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : undefined;
        }
        return undefined;
      };

      const averageDurationRaw =
        coerceNumber(settings['average_appointment_duration']);

      const averageAppointmentDuration = averageDurationRaw ?? 15;

      const estimationModeRaw = settings['estimation_mode'];
      const estimationMode =
        estimationModeRaw === 'ml' || estimationModeRaw === 'basic'
          ? (estimationModeRaw as EstimationMode)
          : 'basic';

      const mlEnabled = settings['ml_enabled'] === true;
      const mlModelVersion = typeof settings['ml_model_version'] === 'string' ? settings['ml_model_version'] : undefined;
      const mlEndpointUrl = typeof settings['ml_endpoint_url'] === 'string' ? settings['ml_endpoint_url'] : undefined;
      const etaBufferMinutes = coerceNumber(settings['eta_buffer_minutes']) ?? 5;
      const etaRefreshIntervalSec = coerceNumber(settings['eta_refresh_interval_sec']) ?? 60;

      return {
        clinicId: clinicData.id,
        estimationMode,
        averageAppointmentDuration,
        etaBufferMinutes,
        etaRefreshIntervalSec,
        mlEnabled,
        mlModelVersion,
        mlEndpointUrl,
        rawSettings: settings,
        queueMode: (clinicData.queue_mode as QueueMode | null) ?? undefined,
        allowOverflow: clinicData.allow_overflow ?? undefined,
        dailyCapacityLimit: clinicData.daily_capacity_limit ?? undefined,
        // Map new overrides
        lateArrivalThresholdMinutes: coerceNumber(settings['late_arrival_threshold_minutes']),
        appointmentRunOverThresholdMinutes: coerceNumber(settings['appointment_run_over_threshold_minutes']),
        historicalDataLookbackDays: coerceNumber(settings['historical_data_lookback_days']),
      };
    } catch (error) {
      logger.error('Failed to load clinic estimation config', error as Error, { staffId });
      return null;
    }
  }

  async recordWaitTimePredictions(predictions: WaitTimePredictionRecord[]): Promise<void> {
    if (!predictions.length) return;
    try {
      const mlTables = supabase as unknown as {
        from: (table: string) => {
          insert: (payload: unknown) => Promise<{ error: { code?: string; message?: string } | null }>;
        };
      };

      // Map estimator modes to database enum values.
      // Database enum accepts canonical values: 'basic' and 'ml'.
      const mapModeToDbEnum = (mode: string): string => {
        switch (mode) {
          case 'ml':
            return 'ml';
          case 'rule-based':
          case 'historical-average':
            return 'basic';
          default:
            throw new Error(`Unsupported estimation mode for persistence: ${mode}`);
        }
      };

      const payload = predictions.map(prediction => ({
        appointment_id: prediction.appointmentId,
        clinic_id: prediction.clinicId,
        prediction_minutes: Math.round(prediction.estimatedMinutes),
        lower_confidence: prediction.lowerConfidence ?? null,
        upper_confidence: prediction.upperConfidence ?? null,
        confidence_score: prediction.confidenceScore ?? null,
        mode: mapModeToDbEnum(prediction.mode), // Map to database enum
        model_version: prediction.modelVersion ?? null,
        feature_hash: prediction.featureHash ?? null,
        features: prediction.features ?? null,
      }));

      const { error } = await mlTables.from('wait_time_predictions').insert(payload);
      if (error) {
        // Log but don't throw - this is non-critical
        logger.warn('Failed to record wait time predictions (table may not exist)', {
          count: predictions.length,
          errorCode: error.code,
          errorMessage: error.message
        });
      }
    } catch (error) {
      // Log but don't throw - this is non-critical for core functionality
      logger.warn('Unexpected error recording wait time predictions (table may not exist)', {
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Records actual wait time and service duration for ML training
   * This is called after an appointment completes to store the ground truth label
   * Uses a database function to bypass RLS policies
   */
  async recordActualWaitTime(
    appointmentId: string,
    data: { actualWaitTime: number; actualServiceDuration?: number }
  ): Promise<void> {
    try {
      logger.debug('Recording actual wait time', { appointmentId, actualWaitTime: data.actualWaitTime });

      // Use database function to bypass RLS
      // The function handles all the logic including error calculation
      const { error: functionError } = await supabase.rpc('record_actual_wait_time', {
        p_appointment_id: appointmentId,
        p_actual_wait_time: data.actualWaitTime,
        p_actual_service_duration: data.actualServiceDuration ?? null,
      });

      if (functionError) {
        logger.error('Failed to record actual wait time via database function', functionError, {
          appointmentId,
          actualWaitTime: data.actualWaitTime,
          actualServiceDuration: data.actualServiceDuration,
        });
        throw functionError;
      }

      logger.info('Successfully recorded actual wait time', {
        appointmentId,
        actualWaitTime: data.actualWaitTime,
        actualServiceDuration: data.actualServiceDuration,
      });
    } catch (error) {
      logger.error('Unexpected error recording actual wait time', error as Error, { appointmentId });
      throw error; // Re-throw so caller knows it failed
    }
  }

  async getHistoricalFeatureSnapshots(
    clinicId: string,
    limit = 200
  ): Promise<WaitTimeFeatureSnapshot[]> {
    try {
      const mlTables = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: string) => {
              order: (orderColumn: string, options: { ascending: boolean }) => {
                limit: (value: number) => Promise<{ data: unknown[] | null; error: Error | null }>;
              };
            };
          };
        };
      };

      const { data, error } = await mlTables
        .from('wait_time_feature_snapshots')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Failed to fetch historical feature snapshots', error, { clinicId });
        return [];
      }

      return (data || []).map((snapshot: any) => ({
        clinicId: snapshot.clinic_id,
        hashedAppointmentId: snapshot.hashed_appointment_id,
        hashedPatientId: snapshot.hashed_patient_id ?? undefined,
        featureSchemaVersion: snapshot.feature_schema_version,
        features: snapshot.features || {},
        labelWaitTime: snapshot.label_wait_time ?? undefined,
        labelServiceDuration: snapshot.label_service_duration ?? undefined,
        dataWindowStart: snapshot.data_window_start ? new Date(snapshot.data_window_start) : undefined,
        dataWindowEnd: snapshot.data_window_end ? new Date(snapshot.data_window_end) : undefined,
        biasFlag: snapshot.bias_flag ?? undefined,
        driftScore: snapshot.drift_score ?? undefined,
        processingPurpose: snapshot.processing_purpose ?? undefined,
        createdAt: snapshot.created_at ? new Date(snapshot.created_at) : undefined,
      }));
    } catch (error) {
      logger.error('Unexpected error fetching feature snapshots', error as Error, { clinicId });
      return [];
    }
  }

  async insertFeatureSnapshots(snapshots: WaitTimeFeatureSnapshotInput[]): Promise<void> {
    if (!snapshots.length) return;
    try {
      const mlTables = supabase as unknown as {
        from: (table: string) => {
          insert: (payload: unknown) => Promise<{ error: Error | null }>;
        };
      };

      const payload = snapshots.map(snapshot => ({
        clinic_id: snapshot.clinicId,
        hashed_appointment_id: snapshot.hashedAppointmentId,
        hashed_patient_id: snapshot.hashedPatientId ?? null,
        feature_schema_version: snapshot.featureSchemaVersion,
        features: snapshot.features,
        label_wait_time: snapshot.labelWaitTime ?? null,
        label_service_duration: snapshot.labelServiceDuration ?? null,
        data_window_start: snapshot.dataWindowStart ?? null,
        data_window_end: snapshot.dataWindowEnd ?? null,
        bias_flag: snapshot.biasFlag ?? null,
        drift_score: snapshot.driftScore ?? null,
        processing_purpose: snapshot.processingPurpose ?? 'wait_time_optimization',
      }));

      const { error } = await mlTables
        .from('wait_time_feature_snapshots')
        .insert(payload);

      if (error) {
        logger.error('Failed to insert feature snapshots', error, { count: snapshots.length });
      }
    } catch (error) {
      logger.error('Unexpected error inserting feature snapshots', error as Error);
    }
  }

  /**
   * Get a single queue entry by ID
   */
  async getQueueEntryById(id: string): Promise<QueueEntry | null> {
    try {
      logger.debug('Fetching queue entry by id', { id });

      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          patient:patients!appointments_patient_id_fkey(id, display_name),
          clinic:clinics(id, name),
          resource:clinic_resources(id, name, resource_type)
        `)
        .eq('id', id)
        .single();

      if (error) {
        logger.error('Failed to fetch queue entry', error, { id });
        throw new DatabaseError('Failed to fetch queue entry', error);
      }

      return data ? this.mapToQueueEntry(data as RawAppointmentRow) : null;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching queue entry', error as Error, { id });
      throw new DatabaseError('Unexpected error fetching queue entry', error as Error);
    }
  }

  /**
   * Get all appointments for an authenticated patient user
   */
  async getPatientAppointments(patientUserId: string): Promise<QueueEntry[]> {
    try {
      logger.debug('Fetching patient appointments', { patientUserId });

      const { data: patientRecord, error: patientError } = await supabase
        .from('patients')
        .select('id')
        .eq('user_id', patientUserId)
        .single();

      if (patientError) {
        logger.error('Failed to resolve patient record for user', patientError, { patientUserId });
        throw new DatabaseError('Failed to resolve patient record for user', patientError);
      }

      if (!patientRecord?.id) {
        return [];
      }

      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          patient:patients!appointments_patient_id_fkey(id, display_name),
          clinic:clinics(id, name, specialty, city),
          resource:clinic_resources(id, name, resource_type)
        `)
        .eq('patient_id', patientRecord.id)
        .order('appointment_date', { ascending: true })
        .order('scheduled_time', { ascending: true, nullsFirst: false });

      if (error) {
        logger.error('Failed to fetch patient appointments', error, { patientUserId });
        throw new DatabaseError('Failed to fetch patient appointments', error);
      }

      return this.mapToQueueEntries(data as RawAppointmentRow[] | null);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching patient appointments', error as Error, { patientUserId });
      throw new DatabaseError('Unexpected error fetching patient appointments', error as Error);
    }
  }

  async getOrCreateQueueStatusToken(appointmentId: string): Promise<string> {
    try {
      logger.debug('Generating queue status token', { appointmentId });

      const { data, error } = await supabase.rpc('generate_queue_status_token', {
        p_appointment_id: appointmentId,
      });

      if (error || !data) {
        logger.error('Failed to generate queue status token', error, { appointmentId });
        throw new DatabaseError('Failed to generate queue status token', error);
      }

      if (typeof data !== 'string' || data.trim().length === 0) {
        throw new DatabaseError('Invalid queue status token payload returned by RPC');
      }

      return data;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error generating queue status token', error as Error, { appointmentId });
      throw new DatabaseError('Unexpected error generating queue status token', error as Error);
    }
  }

  async getPublicQueueStatus(token: string): Promise<PublicQueueStatus | null> {
    try {
      logger.debug('Fetching public queue status', { tokenLength: token.length });

      const { data, error } = await supabase.rpc('get_public_queue_status', {
        p_queue_status_token: token,
      });

      if (error) {
        logger.error('Failed to fetch public queue status', error, { tokenLength: token.length });
        throw new DatabaseError('Failed to fetch public queue status', error);
      }

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return null;
      }

      const payload = data as Record<string, unknown>;

      if (
        typeof payload.appointmentId !== 'string' ||
        typeof payload.clinicId !== 'string' ||
        typeof payload.clinicName !== 'string'
      ) {
        return null;
      }

      const queuePosition = typeof payload.queuePosition === 'number'
        ? payload.queuePosition
        : Number(payload.queuePosition ?? 0);

      return {
        appointmentId: payload.appointmentId,
        clinicId: payload.clinicId,
        clinicName: payload.clinicName,
        queuePosition: Number.isFinite(queuePosition) ? queuePosition : 0,
        status: (payload.status as AppointmentStatus) || AppointmentStatus.SCHEDULED,
        appointmentDate: typeof payload.appointmentDate === 'string' ? payload.appointmentDate : null,
        scheduledTime: typeof payload.scheduledTime === 'string' ? payload.scheduledTime : null,
        predictedStartTime: typeof payload.predictedStartTime === 'string' ? payload.predictedStartTime : null,
        predictedWaitTime: typeof payload.predictedWaitTime === 'number' ? payload.predictedWaitTime : null,
        appointmentType: (payload.appointmentType as AppointmentType) || AppointmentType.CONSULTATION,
        checkedInAt: typeof payload.checkedInAt === 'string' ? payload.checkedInAt : null,
        updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : null,
      };
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching public queue status', error as Error, { tokenLength: token.length });
      throw new DatabaseError('Unexpected error fetching public queue status', error as Error);
    }
  }

  /**
   * Get booked slots for a clinic on a specific date
    * Returns array of appointment IDs and scheduled times for active appointments
   */
    async getClinicBookedSlots(clinicId: string, date: string): Promise<Array<{ id: string; scheduledTime: string }>> {
    try {
      logger.debug('Fetching booked slots', { clinicId, date });

      const activeStatuses: AppointmentStatus[] = [
        AppointmentStatus.SCHEDULED,
        AppointmentStatus.WAITING,
        AppointmentStatus.IN_PROGRESS,
      ];

      const { data, error } = await supabase
        .from('appointments')
        .select('id, appointment_date, scheduled_time, status')
        .eq('clinic_id', clinicId)
        .eq('appointment_date', date)
        .in('status', activeStatuses);

      if (error) {
        logger.error('Failed to fetch booked slots', error, { clinicId, date });
        throw new DatabaseError('Failed to fetch booked slots', error);
      }

      return (data || [])
        .filter(apt => apt.scheduled_time)
        .map(apt => ({
          id: apt.id,
          scheduledTime: apt.scheduled_time!,
        }));
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching booked slots', error as Error, { clinicId, date });
      throw new DatabaseError('Unexpected error fetching booked slots', error as Error);
    }
  }

  /**
   * Creates a new queue entry using the canonical RPC workflow.
   */
  async createQueueEntryViaRpc(dto: CreateQueueEntryDTO): Promise<QueueEntry> {
    try {
      logger.debug('Creating queue entry via RPC', { dto });

      const appointmentTypeString = String(dto.appointmentType);

      const { data, error } = await supabase.rpc('create_queue_entry', {
        p_clinic_id: dto.clinicId,
        p_staff_id: dto.staffId || null,
        p_patient_id: dto.patientId,
        p_appointment_type: appointmentTypeString,
        p_is_walk_in: dto.isWalkIn || false,
        p_start_time: dto.startTime || null,
        p_end_time: dto.endTime || null,
      });

      if (error || !data) {
        logger.error('Failed to create queue entry via RPC', error, { dto });
        throw new DatabaseError('Failed to create queue entry via RPC', error);
      }

      // The RPC function returns a single JSON object representing the new appointment row.
      // Persist queue metadata that is not part of the RPC contract via a follow-up update.
      const createdEntry = this.mapToQueueEntry(data as unknown as RawAppointmentRow);

      if (
        dto.isGapFiller !== undefined ||
        dto.promotedFromWaitlist !== undefined
      ) {
        return this.updateQueueEntry(createdEntry.id, {
          isGapFiller: dto.isGapFiller,
          promotedFromWaitlist: dto.promotedFromWaitlist,
        });
      }

      return createdEntry;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error creating queue entry via RPC', error as Error, { dto });
      throw new DatabaseError('Unexpected error creating queue entry via RPC', error as Error);
    }
  }



  async updateQueueEntry(id: string, dto: UpdateQueueEntryDTO): Promise<QueueEntry> {
    try {
      logger.debug('Updating queue entry', { id, ...dto });

      // Special case: If cancelling (status = CANCELLED), use RPC function to bypass RLS
      if (dto.status === AppointmentStatus.CANCELLED) {
        // For cancellation, we need the cancelled_by user ID
        // This should be passed via a separate method, but for now we'll use a workaround
        // The QueueService should call cancelAppointmentViaRpc instead
        logger.warn('Cancellation should use cancelAppointmentViaRpc method', { id });
      }

      const updateObj: Record<string, unknown> = {};

      // Keep existing updatable fields
      if (dto.status !== undefined) updateObj.status = dto.status;
      if (dto.queuePosition !== undefined) updateObj.queue_position = dto.queuePosition;
      if (dto.isPresent !== undefined) updateObj.is_present = dto.isPresent;
      if (dto.skipReason !== undefined) updateObj.skip_reason = dto.skipReason;
      if (dto.appointmentType !== undefined) updateObj.appointment_type = dto.appointmentType;
      if (dto.markedAbsentAt !== undefined) updateObj.marked_absent_at = dto.markedAbsentAt;
      if (dto.returnedAt !== undefined) updateObj.returned_at = dto.returnedAt;
      if (dto.scheduledTime !== undefined) updateObj.scheduled_time = dto.scheduledTime;

      if (dto.checkedInAt !== undefined) updateObj.checked_in_at = dto.checkedInAt;
      if (dto.actualEndTime !== undefined) updateObj.actual_end_time = dto.actualEndTime;
      if (dto.actualDuration !== undefined) updateObj.actual_duration = dto.actualDuration;
      if (dto.resourceId !== undefined) updateObj.resource_id = dto.resourceId;
      if (dto.priorityScore !== undefined) updateObj.priority_score = dto.priorityScore;
      if (dto.isGapFiller !== undefined) updateObj.is_gap_filler = dto.isGapFiller;
      if (dto.promotedFromWaitlist !== undefined) {
        updateObj.promoted_from_waitlist = dto.promotedFromWaitlist;
      }
      if (dto.billingAmount !== undefined) updateObj.billing_amount = dto.billingAmount;
      if (dto.currency !== undefined) updateObj.currency = dto.currency;
      if (dto.paymentStatus !== undefined) updateObj.payment_status = dto.paymentStatus;
      if (dto.paidAt !== undefined) updateObj.paid_at = dto.paidAt;
      if (dto.paymentMethod !== undefined) updateObj.payment_method = dto.paymentMethod;

      // Always set updated_at to now()
      updateObj.updated_at = new Date().toISOString();

      // First, try to update without select to avoid 406 errors when RLS blocks
      // We'll check success by fetching the record afterwards
      const { error: updateError } = await supabase
        .from('appointments')
        .update(updateObj)
        .eq('id', id);

      if (updateError) {
        // Check if it's a 406 error (Not Acceptable) which indicates RLS blocking or format mismatch
        // PGRST116 is the PostgREST error code for "Not Acceptable"
        const is406Error = updateError.code === 'PGRST116' || 
                          updateError.message?.includes('406') || 
                          updateError.message?.includes('Not Acceptable') ||
                          updateError.message?.includes('application/vnd.pgrst.object');
        
        if (is406Error) {
          logger.error('Update blocked by RLS policy or format mismatch (406 error)', updateError, { id, dto });
          throw new DatabaseError('No rows updated. You may not have permission to update this appointment, or the request format was invalid.', updateError);
        }
        logger.error('Failed to update queue entry', updateError, { id, dto });
        throw new DatabaseError('Failed to update queue entry', updateError);
      }

      // Now fetch the full updated entry to verify the update succeeded
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          patient:patients!appointments_patient_id_fkey(id, display_name),
          clinic:clinics(id, name),
          resource:clinic_resources(id, name, resource_type)
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error('Failed to fetch updated queue entry', error, { id, dto });
        throw new DatabaseError('Failed to fetch updated queue entry', error);
      }

      if (!data) {
        // If we can't fetch the record after update, it means the update was blocked by RLS
        logger.error('No rows updated - RLS policy may be blocking (cannot fetch after update)', undefined, { id, dto });
        throw new DatabaseError('No rows updated. You may not have permission to update this appointment.', null);
      }

      return this.mapToQueueEntry(data as RawAppointmentRow);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error updating queue entry', error as Error, { id, dto });
      throw new DatabaseError('Unexpected error updating queue entry', error as Error);
    }
  }

  async callPatientIfPresent(
    appointmentId: string,
    checkedInAt: string,
    performedBy?: string
  ): Promise<QueueEntry | null> {
    try {
      logger.debug('Calling patient atomically with status/presence guard', { appointmentId });

      if (performedBy) {
        const { data, error } = await supabase.rpc('assign_resource_and_call_patient', {
          p_appointment_id: appointmentId,
          p_resource_id: null,
          p_performed_by: performedBy,
        });

        if (error) {
          const message = error.message || '';
          const isConcurrentStateChange =
            message.includes('Only scheduled or waiting appointments can be called') ||
            message.includes('Patient is not marked present');

          if (isConcurrentStateChange) {
            return null;
          }

          logger.error('Failed to atomically call patient via RPC', error, { appointmentId, performedBy });
          throw new DatabaseError('Failed to atomically call patient', error);
        }

        if (!data) {
          return null;
        }

        return this.mapToQueueEntry(data as RawAppointmentRow);
      }

      const { data, error } = await supabase
        .from('appointments')
        .update({
          status: AppointmentStatus.IN_PROGRESS,
          checked_in_at: checkedInAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointmentId)
        .eq('status', AppointmentStatus.WAITING)
        .eq('is_present', true)
        .select(`
          *,
          patient:patients!appointments_patient_id_fkey(id, display_name),
          clinic:clinics(id, name),
          resource:clinic_resources(id, name, resource_type)
        `)
        .maybeSingle();

      if (error) {
        logger.error('Failed to atomically call patient', error, { appointmentId });
        throw new DatabaseError('Failed to atomically call patient', error);
      }

      if (!data) {
        return null;
      }

      return this.mapToQueueEntry(data as RawAppointmentRow);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error atomically calling patient', error as Error, { appointmentId });
      throw new DatabaseError('Unexpected error atomically calling patient', error as Error);
    }
  }

  async updateAppointmentPaymentStatus(dto: UpdateAppointmentPaymentDTO): Promise<QueueEntry> {
    try {
      logger.debug('Updating appointment payment status via RPC', {
        appointmentId: dto.appointmentId,
        paymentStatus: dto.paymentStatus,
        paymentMethod: dto.paymentMethod,
      });

      const rpcClient = supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
      };

      const { data, error } = await rpcClient.rpc('update_appointment_payment_status', {
        p_appointment_id: dto.appointmentId,
        p_payment_status: dto.paymentStatus,
        p_payment_method: dto.paymentMethod ?? null,
        p_paid_at: dto.paidAt ?? null,
        p_billing_amount: dto.billingAmount ?? null,
        p_currency: dto.currency ?? null,
      });

      if (error || !data) {
        logger.error('Failed to update appointment payment status', error, { dto });
        throw new DatabaseError('Failed to update appointment payment status', error);
      }

      return this.mapToQueueEntry(data as RawAppointmentRow);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error updating appointment payment status', error as Error, { dto });
      throw new DatabaseError('Unexpected error updating appointment payment status', error as Error);
    }
  }

  async assignResourceAndCallPatient(
    appointmentId: string,
    resourceId: string | null | undefined,
    performedBy: string
  ): Promise<QueueEntry> {
    try {
      logger.debug('Assigning resource and calling patient', { appointmentId, resourceId, performedBy });

      const { data, error } = await supabase.rpc('assign_resource_and_call_patient', {
        p_appointment_id: appointmentId,
        p_resource_id: resourceId ?? null,
        p_performed_by: performedBy,
      });

      if (error || !data) {
        logger.error('Failed to assign resource and call patient', error, { appointmentId, resourceId });
        throw new DatabaseError('Failed to assign resource and call patient', error);
      }

      return this.mapToQueueEntry(data as RawAppointmentRow);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error assigning resource and calling patient', error as Error, { appointmentId, resourceId });
      throw new DatabaseError('Unexpected error assigning resource and calling patient', error as Error);
    }
  }

  async getAvailableClinicResources(clinicId: string): Promise<ClinicResourceAvailability[]> {
    try {
      logger.debug('Fetching available clinic resources', { clinicId });

      const { data, error } = await supabase.rpc('get_available_clinic_resources', {
        p_clinic_id: clinicId,
      });

      if (error) {
        logger.error('Failed to fetch available clinic resources', error, { clinicId });
        throw new DatabaseError('Failed to fetch available clinic resources', error);
      }

      const rows = Array.isArray(data)
        ? (data as RawClinicResourceAvailabilityRow[])
        : [];

      return rows.map((row) => ({
        id: row.id,
        clinicId: row.clinic_id,
        name: row.name,
        resourceType: row.resource_type,
        capacity: row.capacity,
        displayOrder: row.display_order,
        isActive: row.is_active,
        notes: row.notes ?? null,
        isOccupied: row.is_occupied,
      }));
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching available clinic resources', error as Error, { clinicId });
      throw new DatabaseError('Unexpected error fetching available clinic resources', error as Error);
    }
  }

  /**
   * Cancel appointment via RPC function (bypasses RLS)
   */
  async cancelAppointmentViaRpc(appointmentId: string, cancelledBy: string, reason?: string): Promise<QueueEntry> {
    try {
      logger.debug('Cancelling appointment via RPC', { appointmentId, cancelledBy, reason });

      const { data, error } = await supabase.rpc('cancel_appointment', {
        p_appointment_id: appointmentId,
        p_cancelled_by: cancelledBy,
        p_reason: reason || 'patient_request',
      });

      if (error || !data) {
        logger.error('Failed to cancel appointment via RPC', error, { appointmentId, cancelledBy });
        throw new DatabaseError('Failed to cancel appointment', error);
      }

      // The RPC returns a JSON object, map it to QueueEntry
      return this.mapToQueueEntry(data as RawAppointmentRow);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error cancelling appointment via RPC', error as Error, { appointmentId });
      throw new DatabaseError('Unexpected error cancelling appointment', error as Error);
    }
  }

  /**
   * Mark patient as checked in
   */
  async checkInPatient(appointmentId: string): Promise<QueueEntry> {
    try {
      logger.info('Checking in patient', { appointmentId });

      const { data, error } = await supabase
        .from('appointments')
        .update({
          status: AppointmentStatus.WAITING,
          is_present: true,
          checked_in_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointmentId)
        .select()
        .single();

      if (error || !data) {
        logger.error('Failed to check in patient', error, { appointmentId });
        throw new DatabaseError('Failed to check in patient', error);
      }

      logger.info('Patient checked in successfully', { appointmentId });
      return this.mapToQueueEntry(data as RawAppointmentRow);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error checking in patient', error as Error, { appointmentId });
      throw new DatabaseError('Unexpected error checking in patient', error as Error);
    }
  }

  /**
   * Get next available queue position
   */
  async getNextQueuePosition(clinicId: string, targetDate: Date): Promise<number> {
    try {
      // Create a timezone-aware start and end of the target day
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('appointments')
        .select('queue_position')
        .eq('clinic_id', clinicId)
        .eq('appointment_date', startOfDay.toISOString().split('T')[0])
        .order('queue_position', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw new DatabaseError('Failed to get next queue position', error);
      }

      return data?.queue_position ? data.queue_position + 1 : 1;
    } catch (error) {
      if (error instanceof DatabaseError) {
        throw error;
      }
      logger.error('Error getting next queue position', error as Error, { clinicId, targetDate });
      throw new DatabaseError('Error getting next queue position', error as Error);
    }
  }

  // ============================================
  // ABSENT PATIENT OPERATIONS
  // ============================================

  /**
   * Get absent patients for a clinic
   */
  async getAbsentPatients(
    clinicId: string,
    startDate: string,
    endDate: string
  ): Promise<AbsentPatient[]> {
    try {
      logger.debug('Fetching absent patients', { clinicId, startDate, endDate });

      // Remove patient:profiles relationship - it doesn't exist as a foreign key
      // Only select appointment relationship which exists
      const { data, error } = await supabase
        .from('absent_patients')
        .select(`
          *,
          appointment:appointments(*)
        `)
        .eq('clinic_id', clinicId)
        .gte('marked_absent_at', startDate)
        .lte('marked_absent_at', endDate)
        .order('marked_absent_at', { ascending: false });

      if (error) {
        logger.error('Failed to fetch absent patients', error, { clinicId });
        throw new DatabaseError('Failed to fetch absent patients', error);
      }

      return (data || []).map(item => this.mapToAbsentPatient(item as RawAbsentPatientRow));
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching absent patients', error as Error, { clinicId });
      throw new DatabaseError('Unexpected error fetching absent patients', error as Error);
    }
  }

  /**
   * Get absent records whose grace period has expired and are still unresolved.
   */
  async getPendingGraceExpiries(referenceTime: Date, clinicId?: string): Promise<AbsentPatient[]> {
    try {
      const referenceIso = referenceTime.toISOString();

      let query = supabase
        .from('absent_patients')
        .select('*')
        .is('returned_at', null)
        .eq('auto_cancelled', false)
        .not('grace_period_ends_at', 'is', null)
        .lte('grace_period_ends_at', referenceIso)
        .order('grace_period_ends_at', { ascending: true });

      if (clinicId) {
        query = query.eq('clinic_id', clinicId);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Failed to fetch pending grace expiries', error, { referenceIso });
        throw new DatabaseError('Failed to fetch pending grace expiries', error);
      }

      return (data || []).map(item => this.mapToAbsentPatient(item as RawAbsentPatientRow));
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching pending grace expiries', error as Error, {
        referenceTime: referenceTime.toISOString(),
        clinicId,
      });
      throw new DatabaseError('Unexpected error fetching pending grace expiries', error as Error);
    }
  }

  /**
   * Create absent patient record
   */
  async createAbsentPatient(
    appointmentId: string,
    clinicId: string,
    patientId: string | null,
    markedBy: string,
    reason?: string,
    gracePeriodEndsAt?: Date
  ): Promise<AbsentPatient> {
    try {
      logger.debug('Creating absent patient record', {
        appointmentId,
        clinicId,
        patientId,
      });

      // Build insert object based on patient type
      if (!patientId) {
        throw new Error('Patient ID is required to mark an absence');
      }

      const insertData = {
        appointment_id: appointmentId,
        clinic_id: clinicId,
        patient_id: patientId,
        marked_absent_at: new Date().toISOString(),
        grace_period_ends_at: gracePeriodEndsAt?.toISOString() ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Insert the record first
      const { data: insertResult, error: insertError } = await supabase
        .from('absent_patients')
        .insert(insertData)
        .select('*')
        .maybeSingle();

      if (insertError) {
        logger.error('Failed to create absent patient record', insertError, { appointmentId });
        throw new DatabaseError('Failed to create absent patient record', insertError);
      }

      // If insert succeeded but select returned no data (shouldn't happen, but handle gracefully)
      if (!insertResult) {
        // Try to fetch the record we just inserted
        const { data: fetchedData, error: fetchError } = await supabase
          .from('absent_patients')
          .select('*')
          .eq('appointment_id', appointmentId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (fetchError || !fetchedData) {
          logger.error('Insert succeeded but could not fetch absent patient record', fetchError, { appointmentId });
          // Still throw error since we can't return the data
          throw new DatabaseError('Absent patient record created but could not be retrieved', fetchError);
        }

        return this.mapToAbsentPatient(fetchedData as RawAbsentPatientRow);
      }

      return this.mapToAbsentPatient(insertResult as RawAbsentPatientRow);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error creating absent patient', error as Error, { appointmentId });
      throw new DatabaseError('Unexpected error creating absent patient', error as Error);
    }
  }

  /**
   * Mark patient as returned
   */
  async markPatientReturned(
    appointmentId: string,
    newPosition: number
  ): Promise<AbsentPatient> {
    try {
      const { data, error } = await supabase
        .from('absent_patients')
        .update({
          returned_at: new Date().toISOString(),
          new_position: newPosition,
          updated_at: new Date().toISOString(),
        })
        .eq('appointment_id', appointmentId)
        .is('returned_at', null)
        .select('*')
        .maybeSingle();

      if (error) {
        logger.error('Failed to mark patient as returned', error, { appointmentId });
        throw new DatabaseError('Failed to mark patient as returned', error);
      }

      if (!data) {
        throw new DatabaseError('No absent patient record found to mark as returned', null);
      }

      return this.mapToAbsentPatient(data as RawAbsentPatientRow);
    } catch (error) {
      logger.error('Error marking patient as returned', error as Error, { appointmentId });
      throw new DatabaseError('Error marking patient as returned', error as Error);
    }
  }

  async resolveAbsentPatientRecord(
    appointmentId: string,
    resolution: 'rebooked' | 'waitlist'
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('absent_patients')
        .update({
          returned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          auto_cancelled: resolution === 'waitlist',
        })
        .eq('appointment_id', appointmentId)
        .is('returned_at', null);

      if (error) {
        throw new DatabaseError('Failed to resolve absent patient record', error);
      }
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error resolving absent patient record', error as Error, { appointmentId });
      throw new DatabaseError('Unexpected error resolving absent patient record', error as Error);
    }
  }

  /**
   * Mark the active absent record as auto-cancelled after grace expiration.
   */
  async markAbsentPatientAutoCancelled(appointmentId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('absent_patients')
        .update({
          returned_at: new Date().toISOString(),
          auto_cancelled: true,
          updated_at: new Date().toISOString(),
        })
        .eq('appointment_id', appointmentId)
        .is('returned_at', null)
        .is('auto_cancelled', false)
        .select('id')
        .maybeSingle();

      if (error) {
        throw new DatabaseError('Failed to mark absent patient as auto-cancelled', error);
      }

      if (!data) {
        logger.info('Skipped absent auto-cancel update due to concurrent resolution or no active record', {
          appointmentId,
        });
        return false;
      }

      return true;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error marking absent patient as auto-cancelled', error as Error, {
        appointmentId,
      });
      throw new DatabaseError('Unexpected error marking absent patient as auto-cancelled', error as Error);
    }
  }

  // ============================================
  // QUEUE OVERRIDE AUDIT
  // ============================================

  /**
   * Create queue override audit record
   */
  async getQueueOverrides(
    clinicId: string,
    startDate: string,
    endDate: string
  ): Promise<QueueOverride[]> {
    try {
      logger.debug('Fetching queue overrides', { clinicId, startDate, endDate });

      const { data, error } = await supabase
        .from('queue_overrides')
        .select(`
          *,
          appointment:appointments(*),
          created_by_user:profiles!queue_overrides_performed_by_fkey(id, full_name)
        `)
        .eq('clinic_id', clinicId)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Failed to fetch queue overrides', error, { clinicId });
        throw new DatabaseError('Failed to fetch queue overrides', error);
      }

      return (data || []).map(item => this.mapToQueueOverride(item as RawQueueOverrideRow));
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching queue overrides', error as Error, { clinicId });
      throw new DatabaseError('Unexpected error fetching queue overrides', error as Error);
    }
  }

  /**
   * Create queue override audit record
   */
  async createQueueOverride(
    clinicId: string,
    appointmentId: string,
    action: QueueActionType,
    createdBy: string,
    reason?: string,
    previousPosition?: number,
    newPosition?: number,
    previousState?: Record<string, any>,
    newState?: Record<string, any>
  ): Promise<QueueOverride> {
    try {
      logger.debug('Creating queue override', {
        clinicId,
        appointmentId,
        action,
      });

      // Make sure we're using a valid profile ID which is now required due to FK constraint
      let validPerformedBy = createdBy;

      // Check if this is a valid profile ID for the current user
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', createdBy)
        .single();

      if (profileError || !profileData) {
        // If the direct profile check fails, try to get the current user's profile
        const { data: currentUserProfile, error: currentUserError } = await supabase.auth.getUser();

        if (currentUserError || !currentUserProfile) {
          logger.error('Failed to get current user for queue override', currentUserError || new Error('No current user'), { createdBy });
          throw new DatabaseError('Cannot get current user profile', currentUserError || new Error('No current user'));
        }

        // In Supabase, profiles.id typically matches auth.users.id
        // Try to get the profile using the user ID directly
        const { data: userProfile, error: userProfileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', currentUserProfile.user.id)
          .maybeSingle();

        if (userProfileError) {
          logger.error('Error querying profile for current user', userProfileError, { 
            userId: currentUserProfile.user.id,
            providedId: createdBy 
          });
          throw new DatabaseError('Error querying profile for current user', userProfileError);
        }

        if (!userProfile) {
          // If profile doesn't exist, try using the user ID directly (in case profiles.id = auth.users.id)
          logger.warn('Profile not found for user, using user ID directly', { 
            userId: currentUserProfile.user.id,
            providedId: createdBy 
          });
          validPerformedBy = currentUserProfile.user.id;
        } else {
          logger.debug('Using current user profile instead of provided ID', {
            providedId: createdBy,
            userId: currentUserProfile.user.id,
            profileId: userProfile.id
          });
          validPerformedBy = userProfile.id;
        }
      } else {
        validPerformedBy = profileData.id;
      }

      logger.debug('Inserting queue override with data', {
        clinic_id: clinicId,
        appointment_id: appointmentId,
        action_type: action,
        performed_by: validPerformedBy,
        previous_position: previousPosition,
        new_position: newPosition,
      });

      // Ensure validPerformedBy is not null/undefined before inserting
      if (!validPerformedBy) {
        logger.error('Cannot create queue override: performed_by is required but not found', undefined, {
          clinicId,
          appointmentId,
          action,
          createdBy,
        });
        throw new DatabaseError('Cannot create queue override: performed_by is required', new Error('performed_by is null or undefined'));
      }

      const { data, error } = await supabase
        .from('queue_overrides')
        .insert({
          clinic_id: clinicId,
          appointment_id: appointmentId,
          action_type: action,
          performed_by: validPerformedBy, // Use the verified profile ID
          reason: reason || null,
          previous_position: previousPosition ?? null,
          new_position: newPosition ?? null,
          // Note: previous_state and new_state are not in the table schema, removed
        })
        .select('*')
        .single();

      if (error || !data) {
        logger.error('Failed to create queue override', error, {
          clinicId,
          appointmentId,
          insertData: {
            clinic_id: clinicId,
            appointment_id: appointmentId,
            action_type: action,
            performed_by: validPerformedBy,
            reason,
            previous_position: previousPosition,
            new_position: newPosition,
          },
          errorDetails: error ? {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code,
          } : 'No data returned'
        });
        throw new DatabaseError('Failed to create queue override', error);
      }

      // Return basic override data without relations
      return {
        id: data.id,
        clinicId: data.clinic_id,
        appointmentId: data.appointment_id,
        skippedPatientIds: data.skipped_patient_ids || [],
        actionType: data.action_type as QueueActionType,
        performedBy: data.performed_by,
        reason: data.reason,
        previousPosition: data.previous_position,
        newPosition: data.new_position,
        createdAt: new Date(data.created_at),
        previousState: this.toObjectRecord(data.previous_state),
        newState: this.toObjectRecord(data.new_state),
      };
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error creating queue override', error as Error, { clinicId, appointmentId });
      throw new DatabaseError('Unexpected error creating queue override', error as Error);
    }
  }

  // ============================================
  // ORCHESTRATOR & ESTIMATION SUPPORT
  // ============================================

  /**
   * Get current queue state for estimation
   */
  async getQueueState(clinicId: string, date: Date): Promise<{ totalWaiting: number; totalInProgress: number; averageWaitTime?: number } | undefined> {
    try {
      const dateStr = date.toISOString().split('T')[0];

      // Get all appointments for the clinic on this date
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('status, checked_in_at, appointment_date, scheduled_time')
        .eq('clinic_id', clinicId)
        .eq('appointment_date', dateStr);

      if (error || !appointments) {
        logger.debug('Could not fetch queue state, using defaults', { clinicId, error });
        return undefined;
      }

      // Calculate queue metrics
      const waiting = appointments.filter(a =>
        a.status === AppointmentStatus.WAITING || a.status === AppointmentStatus.SCHEDULED
      ).length;

      const inProgress = appointments.filter(a =>
        a.status === AppointmentStatus.IN_PROGRESS
      ).length;

      // Calculate average wait time from completed appointments today
      const completed = appointments.filter(a =>
        a.status === AppointmentStatus.COMPLETED && a.checked_in_at && a.scheduled_time
      );

      let averageWaitTime: number | undefined;
      if (completed.length > 0) {
        const totalWaitMinutes = completed.reduce((sum, a) => {
          const scheduledIso = this.composeDateTimeISO(a.appointment_date, a.scheduled_time);
          if (!scheduledIso) return sum;
          const scheduled = new Date(scheduledIso).getTime();
          const checkedIn = new Date(a.checked_in_at!).getTime();
          const waitMinutes = (checkedIn - scheduled) / 60000;
          return sum + Math.max(0, waitMinutes);
        }, 0);
        averageWaitTime = Math.round(totalWaitMinutes / completed.length);
      }

      return {
        totalWaiting: waiting,
        totalInProgress: inProgress,
        averageWaitTime,
      };
    } catch (error) {
      logger.warn('Failed to get queue state', { error, clinicId });
      return undefined;
    }
  }

  /**
   * Get all in-progress appointments for a specific date
   * Used by Orchestrator to check for running-over appointments
   */
  async getInProgressAppointments(date: Date): Promise<QueueEntry[]> {
    try {
      const dateStr = date.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          patient:patients!appointments_patient_id_fkey(id, display_name),
          clinic:clinics(id, name),
          resource:clinic_resources(id, name, resource_type)
        `)
        .eq('appointment_date', dateStr)
        .eq('status', AppointmentStatus.IN_PROGRESS);

      if (error) {
        logger.error('Failed to fetch in-progress appointments', error);
        return [];
      }

      return this.mapToQueueEntries(data as RawAppointmentRow[]);
    } catch (error) {
      logger.error('Unexpected error fetching in-progress appointments', error as Error);
      return [];
    }
  }

  /**
   * Get all waiting appointments for a clinic on a specific date
   * Used by Orchestrator for recalculation
   */
  async getWaitingAppointments(clinicId: string, date: Date): Promise<QueueEntry[]> {
    try {
      const dateStr = date.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          patient:patients!appointments_patient_id_fkey(id, display_name),
          clinic:clinics(id, name),
          resource:clinic_resources(id, name, resource_type)
        `)
        .eq('clinic_id', clinicId)
        .eq('appointment_date', dateStr)
        .in('status', [AppointmentStatus.WAITING, AppointmentStatus.SCHEDULED])
        .eq('is_present', true);

      if (error) {
        logger.error('Failed to fetch waiting appointments', error, { clinicId });
        return [];
      }

      return this.mapToQueueEntries(data as RawAppointmentRow[]);
    } catch (error) {
      logger.error('Unexpected error fetching waiting appointments', error as Error, { clinicId });
      return [];
    }
  }

  /**
   * Batch update appointments (e.g. for mass recalculation)
   */
  async batchUpdateAppointments(updates: { id: string;[key: string]: any }[]): Promise<void> {
    if (updates.length === 0) return;

    try {
      // Supabase doesn't support bulk update with different values easily in one query
      // We'll use Promise.all for now, but in a real high-scale system we'd use a stored procedure
      // or a temporary table approach.

      const promises = updates.map(update => {
        const { id, ...fields } = update;
        return supabase
          .from('appointments')
          .update({
            ...fields,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);
      });

      await Promise.all(promises);
    } catch (error) {
      logger.error('Error in batch update appointments', error as Error);
      throw new DatabaseError('Error in batch update appointments', error as Error);
    }
  }

  // ============================================
  // MAPPING FUNCTIONS
  // ============================================

  private mapScheduleResponse(data: unknown): { queue_mode: QueueMode; schedule: QueueEntry[] } {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new DatabaseError('Invalid schedule RPC payload: expected object with queue_mode and schedule');
    }

    const response = data as ClinicScheduleResponse;

    const mode = response.queue_mode;
    if (mode !== QueueMode.SLOTTED && mode !== QueueMode.FLUID && mode !== QueueMode.HYBRID) {
      throw new DatabaseError(`Invalid queue_mode in schedule RPC payload: ${String(mode)}`);
    }

    return {
      queue_mode: mode,
      schedule: this.mapToQueueEntries(Array.isArray(response.schedule) ? response.schedule : []),
    };
  }

  private composeDateTimeISO(dateValue?: string | null, timeValue?: string | null): string | null {
    if (!dateValue || !timeValue) return null;
    const normalizedTime = timeValue.length === 5 ? `${timeValue}:00` : timeValue;
    return `${dateValue}T${normalizedTime}`;
  }

  private toObjectRecord(value: Json | null | undefined): Record<string, any> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as Record<string, any>;
  }

  private mapToQueueEntry(data: RawAppointmentRow): QueueEntry {
    const resolvedScheduledTime = data.scheduled_time || data.time_slot || undefined;
    const resolvedAppointmentDate = data.appointment_date
      ? new Date(`${data.appointment_date}T00:00:00`)
      : new Date();

    const patientInfo = data.patient ? {
      id: data.patient.id,
      fullName: data.patient.display_name,
    } : undefined;

    const clinicInfo = data.clinic ? {
      id: data.clinic.id,
      name: data.clinic.name ?? undefined,
      specialty: data.clinic.specialty ?? undefined,
      city: data.clinic.city ?? undefined,
    } : undefined;

    const resourceInfo = data.resource ? {
      id: data.resource.id,
      name: data.resource.name,
      resourceType: data.resource.resource_type,
    } : undefined;

    return {
      id: data.id,
      clinicId: data.clinic_id,
      patientId: data.patient_id || '',
      staffId: data.staff_id,
      appointmentDate: resolvedAppointmentDate,
      scheduledTime: resolvedScheduledTime,
      queuePosition: data.queue_position ?? 0,
      status: (data.status as AppointmentStatus) || AppointmentStatus.SCHEDULED,
      appointmentType: (data.appointment_type as AppointmentType) || AppointmentType.CONSULTATION,
      isPresent: data.is_present ?? true,
      markedAbsentAt: data.marked_absent_at ? new Date(data.marked_absent_at) : undefined,
      returnedAt: data.returned_at ? new Date(data.returned_at) : undefined,
      checkedInAt: data.checked_in_at ? new Date(data.checked_in_at) : undefined,
      actualEndTime: data.actual_end_time ? new Date(data.actual_end_time) : undefined,
      billingAmount: typeof data.billing_amount === 'number' ? data.billing_amount : undefined,
      currency: data.currency ?? undefined,
      paymentStatus: (data.payment_status as PaymentStatus) ?? undefined,
      paidAt: data.paid_at ? new Date(data.paid_at) : undefined,
      paymentMethod: data.payment_method ?? undefined,
      estimatedDurationMinutes: data.estimated_duration ?? undefined,
      estimatedWaitTime: typeof data.predicted_wait_time === 'number' ? data.predicted_wait_time : undefined,
      predictionMode: undefined,
      predictionConfidence: data.prediction_confidence ?? undefined,
      predictedStartTime: data.predicted_start_time ? new Date(data.predicted_start_time) : undefined,
      etaSource: undefined,
      etaUpdatedAt: data.last_prediction_update ? new Date(data.last_prediction_update) : undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      isWalkIn: data.is_walk_in || false,
      patient: patientInfo,
      clinic: clinicInfo,
      resourceId: data.resource_id ?? undefined,
      resource: resourceInfo,
      originalQueuePosition: data.original_queue_position,
      skipCount: data.skip_count || 0,
      skipReason: data.skip_reason as SkipReason | undefined,
      overrideBy: data.override_by,
      priorityScore: data.priority_score ?? 100,
      isGapFiller: data.is_gap_filler || false,
      promotedFromWaitlist: data.promoted_from_waitlist || false,
      queueStatusToken: data.queue_status_token || undefined,
      lateArrivalConverted: data.late_arrival_converted || false,
      originalSlotTime: data.original_slot_time ? new Date(data.original_slot_time) : undefined,
    };
  }

  private mapToQueueEntries(data: RawAppointmentRow[] | null): QueueEntry[] {
    if (!data || !data.length) return [];
    return data.map(item => this.mapToQueueEntry(item));
  }

  private mapToAbsentPatient(data: RawAbsentPatientRow): AbsentPatient {
    return {
      id: data.id,
      appointmentId: data.appointment_id,
      clinicId: data.clinic_id,
      patientId: data.patient_id || '',
      markedAbsentAt: new Date(data.marked_absent_at),
      returnedAt: data.returned_at ? new Date(data.returned_at) : undefined,
      newPosition: data.new_position,
      notificationSent: data.notification_sent ?? false,
      gracePeriodEndsAt: data.grace_period_ends_at ? new Date(data.grace_period_ends_at) : undefined,
      autoCancelled: data.auto_cancelled ?? false,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  private mapToQueueOverride(data: RawQueueOverrideRow): QueueOverride {
    return {
      id: data.id,
      clinicId: data.clinic_id,
      appointmentId: data.appointment_id,
      skippedPatientIds: data.skipped_patient_ids || [],
      actionType: data.action_type as QueueActionType,
      performedBy: data.performed_by,
      reason: data.reason,
      previousPosition: data.previous_position,
      newPosition: data.new_position,
      createdAt: new Date(data.created_at),
    };
  }

  private mapToQueueBreakState(payload: unknown): QueueBreakState {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new DatabaseError('Invalid queue break payload from RPC');
    }

    const row = payload as Record<string, unknown>;
    const breakId = typeof row.breakId === 'string' ? row.breakId : '';
    const clinicId = typeof row.clinicId === 'string' ? row.clinicId : '';
    const staffId = typeof row.staffId === 'string' ? row.staffId : '';
    const startedBy = typeof row.startedBy === 'string' ? row.startedBy : '';
    const startedAt = typeof row.startedAt === 'string' ? row.startedAt : '';
    const endsAt = typeof row.endsAt === 'string' ? row.endsAt : '';

    if (!breakId || !clinicId || !staffId || !startedBy || !startedAt || !endsAt) {
      throw new DatabaseError('Invalid queue break payload: missing required fields');
    }

    const durationMinutesRaw = Number(row.durationMinutes ?? 0);
    const remainingSecondsRaw = Number(row.remainingSeconds ?? 0);
    const shiftedCountRaw = Number(row.shiftedAppointmentsCount ?? 0);

    return {
      breakId,
      clinicId,
      staffId,
      startedBy,
      reason: typeof row.reason === 'string' ? row.reason : null,
      durationMinutes: Number.isFinite(durationMinutesRaw) ? durationMinutesRaw : 0,
      startedAt,
      endsAt,
      endedAt: typeof row.endedAt === 'string' ? row.endedAt : null,
      remainingSeconds: Number.isFinite(remainingSecondsRaw) ? remainingSecondsRaw : 0,
      pushedSchedule: row.pushedSchedule === true,
      shiftedAppointmentsCount: Number.isFinite(shiftedCountRaw) ? shiftedCountRaw : 0,
    };
  }
}
