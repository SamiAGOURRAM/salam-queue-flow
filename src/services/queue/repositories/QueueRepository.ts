/**
 * Queue Repository
 * Handles all data access for queue management
 * Abstracts Supabase implementation details
 */

import { supabase } from '@/integrations/supabase/client';
import {
  QueueEntry,
  AbsentPatient,
  QueueOverride,
  QueueFilters,
  AppointmentStatus,
  QueueActionType,
  CreateQueueEntryDTO,
  UpdateQueueEntryDTO,
  ClinicEstimationConfig,
  EstimationMode,
  WaitTimePredictionRecord,
  WaitTimeFeatureSnapshot,
  WaitTimeFeatureSnapshotInput,
} from '../models/QueueModels';
import { DatabaseError } from '../../shared/errors';
import { logger } from '../../shared/logging/Logger';

type PatientProfile = {
  id: string;
  full_name?: string | null;
  phone_number?: string | null;
  email?: string | null;
};

type GuestPatientProfile = {
  id: string;
  full_name?: string | null;
  phone_number?: string | null;
};

type ClinicInfo = {
  id: string;
  name?: string | null;
  settings?: Record<string, unknown> | null;
  estimation_mode?: string | null;
  ml_enabled?: boolean | null;
  ml_model_version?: string | null;
  ml_endpoint_url?: string | null;
  eta_buffer_minutes?: number | null;
  eta_refresh_interval_sec?: number | null;
};

type RawAppointmentRow = {
  id: string;
  clinic_id: string;
  patient_id?: string | null;
  guest_patient_id?: string | null;
  staff_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  appointment_date?: string | null;
  queue_position?: number | null;
  status?: AppointmentStatus | null;
  appointment_type?: string | null;
  is_present?: boolean | null;
  marked_absent_at?: string | null;
  returned_at?: string | null;
  checked_in_at?: string | null;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
  estimated_duration?: number | null;
  predicted_wait_time?: number | null;
  prediction_mode?: string | null;
  prediction_confidence?: number | null;
  predicted_start_time?: string | null;
  last_prediction_update?: string | null;
  created_at: string;
  updated_at: string;
  is_guest?: boolean | null;
  original_queue_position?: number | null;
  skip_count?: number | null;
  skip_reason?: string | null;
  override_by?: string | null;
  patient?: PatientProfile | null;
  guest_patient?: GuestPatientProfile | null;
  clinic?: ClinicInfo | null;
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
  operating_mode?: string;
  schedule?: RawAppointmentRow[] | null;
};

export class QueueRepository {
  /**
   * Get all queue entries for a clinic on a specific date
   */
/**
 * Get all queue entries for a clinic on a specific date
 * @param staffId - Staff ID (used to get clinic_id for now)
 * @param targetDate - Target date in YYYY-MM-DD format
 * @param useClinicWide - If true, shows all clinic appointments (default: true for now)
 */
async getDailySchedule(
  staffId: string, 
  targetDate: string,
  useClinicWide: boolean = true  // ← DEFAULT TO CLINIC-WIDE
): Promise<{ operating_mode: string; schedule: QueueEntry[] }> {
  try {
    if (useClinicWide) {
      // ======= CLINIC-WIDE MODE (CURRENT) =======
      logger.debug('Fetching clinic-wide daily schedule via RPC', { staffId, targetDate });

      // Get clinic_id from staff_id using RPC (bypasses RLS)
      const { data: clinicId, error: clinicError } = await supabase.rpc('get_clinic_from_staff', {
        p_staff_id: staffId,
      });

      if (clinicError || !clinicId) {
        logger.error('Failed to get clinic from staff via RPC', clinicError, { staffId });
        throw new DatabaseError(
          `Staff with ID ${staffId} not found or has no associated clinic`,
          clinicError
        );
      }

      // Call the clinic-wide function with the clinic_id from RPC
      const { data, error } = await supabase.rpc('get_daily_schedule_for_clinic', {
        p_clinic_id: clinicId,
        p_target_date: targetDate,
      });

      if (error) {
        logger.error('Failed to fetch clinic-wide schedule via RPC', error);
        throw new DatabaseError('Failed to fetch schedule', error);
      }

      return this.mapScheduleResponse(data, 'clinic_wide');

    } else {
      // ======= STAFF-SPECIFIC MODE (FOR FUTURE) =======
      logger.debug('Fetching staff-specific daily schedule via RPC', { staffId, targetDate });

      const { data, error } = await supabase.rpc('get_daily_schedule_for_staff', {
        p_staff_id: staffId,
        p_target_date: targetDate,
      });

      if (error) {
        logger.error('Failed to fetch staff schedule via RPC', error);
        throw new DatabaseError('Failed to fetch schedule', error);
      }

      return this.mapScheduleResponse(data, 'staff_specific');
    }

  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    logger.error('Unexpected error fetching daily schedule', error as Error);
    throw new DatabaseError('Unexpected error fetching daily schedule', error as Error);
  }
}

  async getClinicEstimationConfigByStaffId(staffId: string): Promise<ClinicEstimationConfig | null> {
    try {
      // Use RPC function to bypass RLS
      const { data, error } = await supabase.rpc('get_clinic_estimation_config', {
        p_staff_id: staffId,
      });

      if (error || !data || !data.clinic) {
        logger.warn('Clinic estimation config not found for staff', { staffId, error });
        return null;
      }

      // RPC returns: { clinic_id, clinic: { ... } }
      const clinic = data.clinic as {
        id: string;
        settings: Record<string, unknown> | null;
        estimation_mode: string;
        ml_enabled: boolean | null;
        ml_model_version: string | null;
        ml_endpoint_url: string | null;
        eta_buffer_minutes: number | null;
        eta_refresh_interval_sec: number | null;
      };

      const settings = clinic.settings || {};
      const coerceNumber = (value: unknown): number | undefined => {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : undefined;
        }
        return undefined;
      };

      const averageDurationRaw =
        coerceNumber(settings['average_appointment_duration']) ??
        coerceNumber(settings['averageAppointmentDuration']) ??
        coerceNumber(settings['averageAppointmentDurationMinutes']);

      const averageAppointmentDuration = averageDurationRaw ?? 15;

      return {
        clinicId: data.clinic_id as string,
        estimationMode: (clinic.estimation_mode || 'basic') as EstimationMode,
        averageAppointmentDuration,
        etaBufferMinutes: clinic.eta_buffer_minutes ?? 5,
        etaRefreshIntervalSec: clinic.eta_refresh_interval_sec ?? 60,
        mlEnabled: clinic.ml_enabled ?? false,
        mlModelVersion: clinic.ml_model_version ?? undefined,
        mlEndpointUrl: clinic.ml_endpoint_url ?? undefined,
        rawSettings: settings,
      };
    } catch (error) {
      logger.error('Failed to load clinic estimation config', error as Error, { staffId });
      return null;
    }
  }

  async recordWaitTimePredictions(predictions: WaitTimePredictionRecord[]): Promise<void> {
    if (!predictions.length) return;
    try {
      // Map estimation mode to database enum values
      // Database enum likely accepts: 'basic', 'ml', 'hybrid'
      // Estimator modes: 'ml', 'rule-based', 'historical-average', 'fallback'
      const mapModeToDbEnum = (mode: string): string => {
        switch (mode) {
          case 'ml':
            return 'ml';
          case 'rule-based':
          case 'historical-average':
          case 'fallback':
            return 'basic'; // Map all non-ML modes to 'basic'
          default:
            return 'basic';
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

      const { error } = await supabase.from('wait_time_predictions').insert(payload);
      if (error) {
        // Log but don't throw - this is non-critical
        logger.warn('Failed to record wait time predictions (table may not exist)', error, { 
          count: predictions.length,
          errorCode: error.code,
          errorMessage: error.message
        });
      }
    } catch (error) {
      // Log but don't throw - this is non-critical for core functionality
      logger.warn('Unexpected error recording wait time predictions (table may not exist)', error as Error);
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
      const { data, error } = await supabase
        .from('wait_time_feature_snapshots')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error('Failed to fetch historical feature snapshots', error, { clinicId });
        return [];
      }

      return (data || []).map(snapshot => ({
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

      const { error } = await supabase
        .from('wait_time_feature_snapshots')
        .insert(payload);

      if (error) {
        logger.error('Failed to insert feature snapshots', error, { count: snapshots.length });
      }
    } catch (error) {
      logger.error('Unexpected error inserting feature snapshots', error as Error);
    }
  }

  // ============================================
  // DEPRECATED & CORE QUEUE OPERATIONS
  // ============================================

  /**
   * @DEPRECATED This method is no longer recommended. Use getDailySchedule instead.
   * Kept for reference during transition.
   */
  async getQueueByDate(filters: QueueFilters): Promise<QueueEntry[]> {
    logger.warn('getQueueByDate is deprecated. Please transition to getDailySchedule.');
    // For now, we can't directly call the new function as it requires a staffId,
    // which the old filters may not have. Returning empty to enforce migration.
    return Promise.resolve([]);
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
          patient:profiles!appointments_patient_fkey(id, full_name, phone_number, email),
          guest_patient:guest_patients(id, full_name, phone_number),
          clinic:clinics(id, name)
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
   * @DEPRECATED This method uses a direct insert and bypasses critical database logic.
   * Use createQueueEntryViaRpc instead.
   */
  async createQueueEntry(dto: CreateQueueEntryDTO): Promise<QueueEntry> {
    logger.warn('DEPRECATED: createQueueEntry called directly. Transition to RPC method.');
    throw new DatabaseError(
      'createQueueEntry is deprecated. Use createQueueEntryViaRpc instead.',
      new Error('Deprecated method invocation')
    );
  }

    // ====================================================================
  // THIS IS THE NEW, CORRECT METHOD
  // ====================================================================
  /**
   * Creates a new queue entry using the robust RPC function.
   * This is the new standard method for creating all appointments.
   */
  async createQueueEntryViaRpc(dto: CreateQueueEntryDTO): Promise<QueueEntry> {
    try {
      logger.debug('Creating queue entry via RPC', { dto });

      // Convert AppointmentType enum to string value
      const appointmentTypeString = typeof dto.appointmentType === 'string' 
        ? dto.appointmentType 
        : dto.appointmentType.toString();

      const { data, error } = await supabase.rpc('create_queue_entry', {
        p_clinic_id: dto.clinicId,
        p_staff_id: dto.staffId,
        p_patient_id: dto.patientId,
        p_guest_patient_id: dto.guestPatientId || null,
        p_is_guest: dto.isGuest || false,
        p_appointment_type: appointmentTypeString, // Ensure it's a string
        p_is_walk_in: dto.isWalkIn || false,
        p_start_time: dto.startTime,
        p_end_time: dto.endTime,
      });

      if (error || !data) {
        logger.error('Failed to create queue entry via RPC', error, { dto });
        throw new DatabaseError('Failed to create queue entry via RPC', error);
      }

      // The RPC function returns a single JSON object representing the new appointment row
      return this.mapToQueueEntry(data as RawAppointmentRow);
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

      // Add new updatable time fields
      if (dto.startTime !== undefined) updateObj.start_time = dto.startTime;
      if (dto.endTime !== undefined) updateObj.end_time = dto.endTime;
      if (dto.actualStartTime !== undefined) updateObj.actual_start_time = dto.actualStartTime;
      if (dto.actualEndTime !== undefined) updateObj.actual_end_time = dto.actualEndTime;
      if (dto.actualDuration !== undefined) updateObj.actual_duration = dto.actualDuration;
      
      // Always set updated_at to now()
      updateObj.updated_at = new Date().toISOString();

      // First, try to update
      const { data: updateData, error: updateError } = await supabase
        .from('appointments')
        .update(updateObj)
        .eq('id', id)
        .select('id')
        .maybeSingle();

      if (updateError) {
        logger.error('Failed to update queue entry', updateError, { id, dto });
        throw new DatabaseError('Failed to update queue entry', updateError);
      }

      if (!updateData) {
        logger.error('No rows updated - RLS policy may be blocking', { id, dto });
        throw new DatabaseError('No rows updated. You may not have permission to update this appointment.', null);
      }

      // Now fetch the full updated entry
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          patient:profiles!appointments_patient_fkey(id, full_name, phone_number, email),
          guest_patient:guest_patients(id, full_name, phone_number),
          clinic:clinics(id, name)
        `)
        .eq('id', id)
        .single();

      if (error || !data) {
        logger.error('Failed to fetch updated queue entry', error, { id, dto });
        throw new DatabaseError('Failed to fetch updated queue entry', error);
      }

      return this.mapToQueueEntry(data as RawAppointmentRow);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error updating queue entry', error as Error, { id, dto });
      throw new DatabaseError('Unexpected error updating queue entry', error as Error);
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
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from('appointments')
        .select('queue_position')
        .eq('clinic_id', clinicId)
        .gte('start_time', startOfDay.toISOString()) // Use new start_time column
        .lte('start_time', endOfDay.toISOString())   // Use new start_time column
        .order('queue_position', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw new DatabaseError('Failed to get next queue position', error);
      }

      return data?.queue_position ? data.queue_position + 1 : 1;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Error getting next queue position', error as Error, { clinicId, targetDate });
      return 1; // Fallback to position 1
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

      const { data, error } = await supabase
        .from('absent_patients')
        .select(`
          *,
          appointment:appointments(*),
          patient:profiles(id, full_name, phone_number)
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
   * Create absent patient record
   */
  async createAbsentPatient(
    appointmentId: string,
    clinicId: string,
    patientId: string | null,
    markedBy: string,
    reason?: string,
    isGuest?: boolean,
    guestPatientId?: string
  ): Promise<AbsentPatient> {
    try {
      logger.debug('Creating absent patient record', {
        appointmentId,
        clinicId,
        patientId,
        isGuest,
        guestPatientId,
      });

      // Build insert object based on patient type
      const insertData: Record<string, unknown> = {
        appointment_id: appointmentId,
        clinic_id: clinicId,
      };

      // Handle guest vs registered patient
      if (isGuest && guestPatientId) {
        insertData.guest_patient_id = guestPatientId;
        insertData.is_guest = true;
        insertData.patient_id = null;
      } else if (patientId) {
        insertData.patient_id = patientId;
        insertData.is_guest = false;
        insertData.guest_patient_id = null;
      } else {
        throw new Error('Either patientId or (isGuest + guestPatientId) must be provided');
      }

      const { data, error } = await supabase
        .from('absent_patients')
        .insert(insertData)
        .select(`
          *,
          appointment:appointments(*),
          patient:profiles(id, full_name, phone_number)
        `)
        .single();

      if (error || !data) {
        logger.error('Failed to create absent patient record', error, { appointmentId });
        throw new DatabaseError('Failed to create absent patient record', error);
      }

      return this.mapToAbsentPatient(data as RawAbsentPatientRow);
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
        .select()
        .single();

      if (error || !data) {
        throw new DatabaseError('Failed to mark patient as returned', error);
      }

      return this.mapToAbsentPatient(data as RawAbsentPatientRow);
    } catch (error) {
      logger.error('Error marking patient as returned', error as Error, { appointmentId });
      throw new DatabaseError('Error marking patient as returned', error as Error);
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
    newPosition?: number
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
        
        logger.debug('Using current user profile instead of provided ID', {
          providedId: createdBy,
          currentUserId: currentUserProfile.user.id
        });
        
        // Use the current user's ID instead
        validPerformedBy = currentUserProfile.user.id;
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
      };
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error creating queue override', error as Error, { clinicId, appointmentId });
      throw new DatabaseError('Unexpected error creating queue override', error as Error);
    }
  }

  // ============================================
  // MAPPING FUNCTIONS
  // ============================================

  private mapScheduleResponse(
    data: ClinicScheduleResponse | null,
    fallbackMode: string
  ): { operating_mode: string; schedule: QueueEntry[] } {
    const scheduleSource: RawAppointmentRow[] = Array.isArray(data?.schedule)
      ? (data?.schedule as RawAppointmentRow[])
      : [];

    return {
      operating_mode: data?.operating_mode ?? fallbackMode,
      schedule: this.mapToQueueEntries(scheduleSource),
    };
  }

  private mapToQueueEntry(data: RawAppointmentRow): QueueEntry {
    const patientInfo = data.is_guest && data.guest_patient ? {
      id: data.guest_patient.id,
      fullName: data.guest_patient.full_name,
      phoneNumber: data.guest_patient.phone_number,
    } : data.patient ? {
      id: data.patient.id,
      fullName: data.patient.full_name,
      phoneNumber: data.patient.phone_number,
      email: data.patient.email,
    } : undefined;

    return {
      id: data.id,
      clinicId: data.clinic_id,
      patientId: data.patient_id || data.guest_patient_id,
      staffId: data.staff_id,
      
      // New authoritative fields
      startTime: data.start_time ? new Date(data.start_time) : undefined,
      endTime: data.end_time ? new Date(data.end_time) : undefined,

      // Deprecated fields, mapped for backward compatibility during transition
      appointmentDate: data.start_time ? new Date(data.start_time) : new Date(data.appointment_date),
      scheduledTime: data.start_time ? new Date(data.start_time).toTimeString().substring(0, 5) : undefined,

      queuePosition: data.queue_position,
      status: data.status as AppointmentStatus,
      appointmentType: data.appointment_type,
      isPresent: data.is_present,
      markedAbsentAt: data.marked_absent_at ? new Date(data.marked_absent_at) : undefined,
      returnedAt: data.returned_at ? new Date(data.returned_at) : undefined,
      checkedInAt: data.checked_in_at ? new Date(data.checked_in_at) : undefined,
      actualStartTime: data.actual_start_time ? new Date(data.actual_start_time) : undefined,
      actualEndTime: data.actual_end_time ? new Date(data.actual_end_time) : undefined,
      estimatedDurationMinutes: data.estimated_duration ?? undefined,
      estimatedWaitTime: typeof data.predicted_wait_time === 'number' ? data.predicted_wait_time : undefined,
      predictionMode: data.prediction_mode as EstimationMode | undefined,
      predictionConfidence: data.prediction_confidence ?? undefined,
      predictedStartTime: data.predicted_start_time ? new Date(data.predicted_start_time) : undefined,
      etaSource: data.prediction_mode as EstimationMode | undefined,
      etaUpdatedAt: data.last_prediction_update ? new Date(data.last_prediction_update) : undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      isGuest: data.is_guest || false,
      guestPatientId: data.guest_patient_id,
      patient: patientInfo,
      // Add other fields from your model as needed
      originalQueuePosition: data.original_queue_position,
      skipCount: data.skip_count || 0,
      skipReason: data.skip_reason,
      overrideBy: data.override_by,
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
      patientId: data.patient_id,
      markedAbsentAt: new Date(data.marked_absent_at),
      returnedAt: data.returned_at ? new Date(data.returned_at) : undefined,
      newPosition: data.new_position,
      notificationSent: data.notification_sent,
      gracePeriodEndsAt: data.grace_period_ends_at ? new Date(data.grace_period_ends_at) : undefined,
      autoCancelled: data.auto_cancelled,
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
}
