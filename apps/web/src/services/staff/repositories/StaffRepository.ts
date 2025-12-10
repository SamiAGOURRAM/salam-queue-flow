/**
 * Staff Repository
 * Handles all data access for staff operations
 * Abstracts Supabase implementation details
 */

import { supabase } from '@/integrations/supabase/client';
import { DatabaseError } from '../../shared/errors';
import { logger } from '../../shared/logging/Logger';

export interface StaffRow {
  id: string;
  clinic_id: string;
  user_id: string;
  role: string;
  specialization?: string | null;
  license_number?: string | null;
  working_hours?: Record<string, unknown> | null;
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
  working_hours?: Record<string, unknown> | null;
  is_active?: boolean;
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
      if (data.working_hours) updateData.working_hours = data.working_hours;
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
}

