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
} from '../models/QueueModels';
import { DatabaseError, NotFoundError } from '../../shared/errors';
import { logger } from '../../shared/logging/Logger';

export class QueueRepository {
  /**
   * Get all queue entries for a clinic on a specific date
   */
  async getDailySchedule(staffId: string, targetDate: string): Promise<{ operating_mode: string; schedule: any[] }> {
    try {
      logger.debug('Fetching daily schedule for staff via RPC', { staffId, targetDate });

      const { data, error } = await supabase.rpc('get_daily_schedule_for_staff', {
        p_staff_id: staffId,
        p_target_date: targetDate,
      });

      if (error) {
        logger.error('Failed to fetch daily schedule via RPC', error);
        throw new DatabaseError('Failed to fetch schedule', error);
      }

      // The RPC function returns a single JSON object with the mode and schedule array.
      // If no data, provide a default structure to prevent frontend errors.
      return data ? 
        { ...data, schedule: this.mapToQueueEntries(data.schedule || []) } : 
        { operating_mode: 'none', schedule: [] };

    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching daily schedule', error as Error);
      throw new DatabaseError('Unexpected error fetching daily schedule', error as Error);
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

      return data ? this.mapToQueueEntry(data) : null;
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
    // The existing broken logic...
    const { data, error } = await supabase.from('appointments').insert({ /* ... */ } as any).select().single();
    if (error || !data) {
      throw new DatabaseError('Failed to create queue entry (deprecated method)', error);
    }
    return this.mapToQueueEntry(data);
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

      const { data, error } = await supabase.rpc('create_queue_entry', {
        p_clinic_id: dto.clinicId,
        p_staff_id: dto.staffId,
        p_patient_id: dto.patientId,
        p_guest_patient_id: dto.guestPatientId,
        p_is_guest: dto.isGuest,
        p_appointment_type: dto.appointmentType,
        p_is_walk_in: dto.isWalkIn,
        p_start_time: dto.startTime,
        p_end_time: dto.endTime,
      });

      if (error || !data) {
        logger.error('Failed to create queue entry via RPC', error, { dto });
        throw new DatabaseError('Failed to create queue entry via RPC', error);
      }

      // The RPC function returns a single JSON object representing the new appointment row
      return this.mapToQueueEntry(data);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error creating queue entry via RPC', error as Error, { dto });
      throw new DatabaseError('Unexpected error creating queue entry via RPC', error as Error);
    }
  }
  


  async updateQueueEntry(id: string, dto: UpdateQueueEntryDTO): Promise<QueueEntry> {
    try {
      logger.debug('Updating queue entry', { id, ...dto });

      const updateObj: Record<string, any> = {};
      
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
      
      // Always set updated_at to now()
      updateObj.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('appointments')
        .update(updateObj)
        .eq('id', id)
        .select(`
          *,
          patient:profiles!appointments_patient_fkey(id, full_name, phone_number, email),
          guest_patient:guest_patients(id, full_name, phone_number),
          clinic:clinics(id, name)
        `)
        .single();

      if (error || !data) {
        logger.error('Failed to update queue entry', error, { id, dto });
        throw new DatabaseError('Failed to update queue entry', error);
      }

      return this.mapToQueueEntry(data);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error updating queue entry', error as Error, { id, dto });
      throw new DatabaseError('Unexpected error updating queue entry', error as Error);
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
      return this.mapToQueueEntry(data);
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

      return (data || []).map(item => this.mapToAbsentPatient(item));
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
      const insertData: any = {
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

      return this.mapToAbsentPatient(data);
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

      return this.mapToAbsentPatient(data);
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

      return (data || []).map(item => this.mapToQueueOverride(item));
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
        } as any)
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

  private mapToQueueEntry(data: any): QueueEntry {
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
      scheduledTime: data.start_time ? new Date(data.start_time).toTimeString().substring(0, 5) : data.scheduled_time,

      queuePosition: data.queue_position,
      status: data.status as AppointmentStatus,
      appointmentType: data.appointment_type,
      isPresent: data.is_present,
      markedAbsentAt: data.marked_absent_at ? new Date(data.marked_absent_at) : undefined,
      returnedAt: data.returned_at ? new Date(data.returned_at) : undefined,
      checkedInAt: data.checked_in_at ? new Date(data.checked_in_at) : undefined,
      actualStartTime: data.actual_start_time ? new Date(data.actual_start_time) : undefined,
      actualEndTime: data.actual_end_time ? new Date(data.actual_end_time) : undefined,
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

  private mapToQueueEntries(data: any[]): QueueEntry[] {
    if (!data) return [];
    return data.map(item => this.mapToQueueEntry(item));
  }
  private mapToAbsentPatient(data: any): AbsentPatient {
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

  private mapToQueueOverride(data: any): QueueOverride {
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
