/**
 * Staff Repository
 * Handles all data access for staff operations
 * Abstracts Supabase implementation details
 */

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { DatabaseError } from '../../shared/errors';
import { logger } from '../../shared/logging/Logger';

export interface StaffRow {
  id: string;
  clinic_id: string;
  user_id: string;
  role: string;
  specialization?: string | null;
  license_number?: string | null;
  working_hours?: Json | null;
  appointment_types_override?: Json | null;
  daily_queue_modes_override?: Json | null;
  average_consultation_duration?: number | null;
  patients_per_day_avg?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateStaffRow {
  clinic_id: string;
  user_id: string;
  role: string;
  specialization?: string | null;
  license_number?: string | null;
  working_hours?: Json | null;
  appointment_types_override?: Json | null;
  daily_queue_modes_override?: Json | null;
  is_active?: boolean;
}

export interface QueueAssignmentRow {
  clinic_id: string;
  staff_id: string;
  assigned_staff_id: string;
}

export interface UpdateDoctorOverridesRow {
  working_hours?: Json | null;
  appointment_types_override?: Json | null;
  daily_queue_modes_override?: Json | null;
}

export class StaffRepository {
  /**
   * Get staff by user ID
   */
  async getStaffByUser(userId: string): Promise<StaffRow | null> {
    try {
      const { data, error } = await supabase
        .from('clinic_staff')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        logger.error('Failed to get staff by user', error, { userId });
        throw new DatabaseError('Failed to get staff by user', error);
      }

      return data as StaffRow | null;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error getting staff by user', error as Error, { userId });
      throw new DatabaseError('Unexpected error getting staff by user', error as Error);
    }
  }

  /**
   * Get staff by clinic ID
   */
  async getStaffByClinic(clinicId: string): Promise<StaffRow[]> {
    try {
      const { data, error } = await supabase
        .from('clinic_staff')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) {
        logger.error('Failed to get staff by clinic', error, { clinicId });
        throw new DatabaseError('Failed to get staff by clinic', error);
      }

      return (data || []) as StaffRow[];
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error getting staff by clinic', error as Error, { clinicId });
      throw new DatabaseError('Unexpected error getting staff by clinic', error as Error);
    }
  }

  /**
   * Get staff by clinic and user ID
   */
  async getStaffByClinicAndUser(clinicId: string, userId: string): Promise<StaffRow | null> {
    try {
      const { data, error } = await supabase
        .from('clinic_staff')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        logger.error('Failed to get staff by clinic and user', error, { clinicId, userId });
        throw new DatabaseError('Failed to get staff by clinic and user', error);
      }

      return data as StaffRow | null;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error getting staff by clinic and user', error as Error, { clinicId, userId });
      throw new DatabaseError('Unexpected error getting staff by clinic and user', error as Error);
    }
  }

  /**
   * Get staff by ID
   */
  async getStaffById(staffId: string): Promise<StaffRow> {
    try {
      const { data, error } = await supabase
        .from('clinic_staff')
        .select('*')
        .eq('id', staffId)
        .single();

      if (error || !data) {
        logger.error('Staff not found', error, { staffId });
        throw new DatabaseError('Staff not found', error);
      }

      return data as StaffRow;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error getting staff by ID', error as Error, { staffId });
      throw new DatabaseError('Unexpected error getting staff by ID', error as Error);
    }
  }

  /**
   * Add staff to clinic
   */
  async addStaff(data: CreateStaffRow): Promise<StaffRow> {
    try {
      const { data: staff, error } = await supabase
        .from('clinic_staff')
        .insert({
          ...data,
          is_active: data.is_active ?? true,
        })
        .select()
        .single();

      if (error || !staff) {
        logger.error('Failed to add staff', error, { data });
        throw new DatabaseError('Failed to add staff', error);
      }

      return staff as StaffRow;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error adding staff', error as Error, { data });
      throw new DatabaseError('Unexpected error adding staff', error as Error);
    }
  }

  /**
   * Remove staff from clinic
   */
  async removeStaff(staffId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('clinic_staff')
        .delete()
        .eq('id', staffId);

      if (error) {
        logger.error('Failed to remove staff', error, { staffId });
        throw new DatabaseError('Failed to remove staff', error);
      }

      logger.info('Staff removed', { staffId });
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error removing staff', error as Error, { staffId });
      throw new DatabaseError('Unexpected error removing staff', error as Error);
    }
  }

  /**
   * Update staff information
   */
  async updateStaff(staffId: string, data: Partial<StaffRow>): Promise<StaffRow> {
    try {
      const updateData: Record<string, unknown> = {};
      if (data.role) updateData.role = data.role;
      if (data.specialization !== undefined) updateData.specialization = data.specialization;
      if (data.license_number !== undefined) updateData.license_number = data.license_number;
      if (data.working_hours !== undefined) updateData.working_hours = data.working_hours;
      if (data.appointment_types_override !== undefined) updateData.appointment_types_override = data.appointment_types_override;
      if (data.daily_queue_modes_override !== undefined) updateData.daily_queue_modes_override = data.daily_queue_modes_override;
      if (data.average_consultation_duration !== undefined) updateData.average_consultation_duration = data.average_consultation_duration;
      if (data.is_active !== undefined) updateData.is_active = data.is_active;

      const { error } = await supabase
        .from('clinic_staff')
        .update(updateData)
        .eq('id', staffId);

      if (error) {
        logger.error('Failed to update staff', error, { staffId, data });
        throw new DatabaseError('Failed to update staff', error);
      }

      logger.info('Staff updated', { staffId });
      return this.getStaffById(staffId);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error updating staff', error as Error, { staffId, data });
      throw new DatabaseError('Unexpected error updating staff', error as Error);
    }
  }

  async updateDoctorOverrides(staffId: string, data: UpdateDoctorOverridesRow): Promise<StaffRow> {
    try {
      const { data: updatedStaff, error } = await supabase.rpc('update_staff_doctor_overrides', {
        p_staff_id: staffId,
        p_working_hours: data.working_hours ?? null,
        p_appointment_types_override: data.appointment_types_override ?? null,
        p_daily_queue_modes_override: data.daily_queue_modes_override ?? null,
      });

      if (error || !updatedStaff) {
        logger.error('Failed to update doctor overrides', error, { staffId, data });
        throw new DatabaseError('Failed to update doctor overrides', error);
      }

      return updatedStaff as StaffRow;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error updating doctor overrides', error as Error, { staffId, data });
      throw new DatabaseError('Unexpected error updating doctor overrides', error as Error);
    }
  }

  async resolveQueueScope(staffId: string): Promise<Record<string, unknown>> {
    try {
      const { data, error } = await supabase.rpc('resolve_queue_scope_for_staff', {
        p_staff_id: staffId,
      });

      if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
        logger.error('Failed to resolve queue scope for staff', error, { staffId });
        throw new DatabaseError('Failed to resolve queue scope for staff', error);
      }

      return data as Record<string, unknown>;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error resolving queue scope for staff', error as Error, { staffId });
      throw new DatabaseError('Unexpected error resolving queue scope for staff', error as Error);
    }
  }

  async replaceQueueAssignments(staffId: string, assignedStaffIds: string[]): Promise<Record<string, unknown>> {
    try {
      const { data, error } = await supabase.rpc('replace_staff_queue_assignments', {
        p_staff_id: staffId,
        p_assigned_staff_ids: assignedStaffIds,
      });

      if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
        logger.error('Failed to replace queue assignments', error, {
          staffId,
          assignedStaffCount: assignedStaffIds.length,
        });
        throw new DatabaseError('Failed to replace queue assignments', error);
      }

      return data as Record<string, unknown>;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error replacing queue assignments', error as Error, {
        staffId,
        assignedStaffCount: assignedStaffIds.length,
      });
      throw new DatabaseError('Unexpected error replacing queue assignments', error as Error);
    }
  }

  async getQueueAssignmentsByClinic(clinicId: string): Promise<QueueAssignmentRow[]> {
    try {
      const { data, error } = await supabase
        .from('staff_queue_assignments')
        .select('clinic_id, staff_id, assigned_staff_id')
        .eq('clinic_id', clinicId);

      if (error) {
        logger.error('Failed to fetch queue assignments by clinic', error, { clinicId });
        throw new DatabaseError('Failed to fetch queue assignments by clinic', error);
      }

      return (data || []) as QueueAssignmentRow[];
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching queue assignments by clinic', error as Error, { clinicId });
      throw new DatabaseError('Unexpected error fetching queue assignments by clinic', error as Error);
    }
  }
}

