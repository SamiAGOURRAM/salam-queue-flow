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

  // ============================================
  // QUEUE ENTRY OPERATIONS
  // ============================================

  /**
   * Get all queue entries for a clinic on a specific date
   */
  async getQueueByDate(filters: QueueFilters): Promise<QueueEntry[]> {
    try {
      logger.debug('Fetching queue entries', filters);

      let query = supabase
        .from('appointments')
        .select(`
          *,
          patient:profiles!appointments_patient_fkey(id, full_name, phone_number, email),
          guest_patient:guest_patients(id, full_name, phone_number),
          clinic:clinics(id, name)
        `)
        .eq('clinic_id', filters.clinicId)
        .gte('appointment_date', filters.startDate)
        .lte('appointment_date', filters.endDate)
        .order('appointment_date', { ascending: true })
        .order('queue_position', { ascending: true });

      // Apply status filter if provided
      if (filters.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      } else {
        // Default: exclude completed and cancelled unless explicitly requested
        const excludedStatuses: AppointmentStatus[] = [];
        if (!filters.includeCompleted) {
          excludedStatuses.push(AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED);
        }
        if (excludedStatuses.length > 0) {
          query = query.not('status', 'in', `(${excludedStatuses.join(',')})`);
        }
      }

      // Exclude absent patients unless explicitly requested
      if (!filters.includeAbsent) {
        query = query.or('skip_reason.is.null,skip_reason.neq.patient_absent');
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Failed to fetch queue entries', error, { filters });
        throw new DatabaseError('Failed to fetch queue entries', error);
      }

      return this.mapToQueueEntries(data || []);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching queue', error as Error, { filters });
      throw new DatabaseError('Unexpected error fetching queue', error as Error);
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
   * Create a new queue entry
   */
  async createQueueEntry(dto: CreateQueueEntryDTO): Promise<QueueEntry> {
    try {
      logger.debug('Creating queue entry', dto);

      const { data, error } = await supabase
        .from('appointments')
        .insert({
          clinic_id: dto.clinicId,
          patient_id: dto.patientId,
          staff_id: dto.staffId,
          appointment_date: dto.appointmentDate,
          appointment_type: dto.appointmentType,
          status: dto.status || AppointmentStatus.WAITING,
          queue_position: dto.queuePosition,
          notes: dto.notes,
        } as any)
        .select(`
          *,
          patient:profiles!appointments_patient_fkey(id, full_name, phone_number, email),
          guest_patient:guest_patients(id, full_name, phone_number),
          clinic:clinics(id, name)
        `)
        .single();

      if (error || !data) {
        logger.error('Failed to create queue entry', error, { dto });
        throw new DatabaseError('Failed to create queue entry', error);
      }

      return this.mapToQueueEntry(data);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error creating queue entry', error as Error, { dto });
      throw new DatabaseError('Unexpected error creating queue entry', error as Error);
    }
  }

  /**
   * Update a queue entry
   */

  /**
   * Update a queue entry
   */
  async updateQueueEntry(
    id: string,
    dto: UpdateQueueEntryDTO
  ): Promise<QueueEntry> {
    try {
      logger.debug('Updating queue entry', { id, ...dto });

      // Build update object with only defined fields
      const updateObj: Record<string, any> = {};
      
      if (dto.status !== undefined) updateObj.status = dto.status;
      if (dto.queuePosition !== undefined) updateObj.queue_position = dto.queuePosition;
      if (dto.isPresent !== undefined) updateObj.is_present = dto.isPresent;
      if (dto.skipReason !== undefined) updateObj.skip_reason = dto.skipReason;
      if (dto.scheduledTime !== undefined) updateObj.scheduled_time = dto.scheduledTime;
      if (dto.appointmentType !== undefined) updateObj.appointment_type = dto.appointmentType;
      if (dto.markedAbsentAt !== undefined) updateObj.marked_absent_at = dto.markedAbsentAt;
      if (dto.returnedAt !== undefined) updateObj.returned_at = dto.returnedAt;
      
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
  async getNextQueuePosition(clinicId: string, date: Date): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('queue_position')
        .eq('clinic_id', clinicId)
        .eq('appointment_date', date.toISOString().split('T')[0])
        .order('queue_position', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows returned (which is fine - queue is empty)
        throw new DatabaseError('Failed to get next queue position', error);
      }

      return data ? data.queue_position + 1 : 1;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Error getting next queue position', error as Error, { clinicId, date });
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
    // Determine patient info from either registered patient or guest
    const patientInfo = data.is_guest && data.guest_patient ? {
      id: data.guest_patient.id,
      fullName: data.guest_patient.full_name,
      phoneNumber: data.guest_patient.phone_number,
      email: undefined,
      dateOfBirth: undefined,
    } : data.patient ? {
      id: data.patient.id,
      fullName: data.patient.full_name,
      phoneNumber: data.patient.phone_number,
      email: data.patient.email,
      dateOfBirth: data.patient.date_of_birth ? new Date(data.patient.date_of_birth) : undefined,
    } : undefined;

    return {
      id: data.id,
      clinicId: data.clinic_id,
      patientId: data.patient_id || data.guest_patient_id,
      staffId: data.staff_id,
      appointmentDate: new Date(data.appointment_date),
      scheduledTime: data.scheduled_time,
      queuePosition: data.queue_position,
      originalQueuePosition: data.original_queue_position,
      status: data.status as AppointmentStatus,
      appointmentType: data.appointment_type,
      isPresent: data.is_present,
      markedAbsentAt: data.marked_absent_at ? new Date(data.marked_absent_at) : undefined,
      returnedAt: data.returned_at ? new Date(data.returned_at) : undefined,
      skipCount: data.skip_count || 0,
      skipReason: data.skip_reason,
      overrideBy: data.override_by,
      checkedInAt: data.checked_in_at ? new Date(data.checked_in_at) : undefined,
      actualStartTime: data.actual_start_time ? new Date(data.actual_start_time) : undefined,
      actualEndTime: data.actual_end_time ? new Date(data.actual_end_time) : undefined,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      isGuest: data.is_guest || false,
      guestPatientId: data.guest_patient_id,
      patient: patientInfo,
    };
  }

  private mapToQueueEntries(data: any[]): QueueEntry[] {
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
