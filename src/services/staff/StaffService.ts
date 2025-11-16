/**
 * Staff Service
 * Handles all staff-related operations
 * Uses repository pattern - NO direct Supabase client usage
 */

import { StaffRepository } from './repositories/StaffRepository';
import { logger } from '../shared/logging/Logger';
import { NotFoundError, ValidationError, DatabaseError } from '../shared/errors';

export interface StaffProfile {
  id: string;
  clinicId: string;
  userId: string;
  role: string;
  specialization?: string;
  licenseNumber?: string;
  workingHours?: Record<string, unknown>;
  averageConsultationDuration?: number;
  patientsPerDayAvg?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateStaffDTO {
  clinicId: string;
  userId: string;
  role: string;
  specialization?: string;
  licenseNumber?: string;
  workingHours?: Record<string, unknown>;
}

export class StaffService {
  private repository: StaffRepository;

  constructor(repository?: StaffRepository) {
    this.repository = repository || new StaffRepository();
  }

  /**
   * Get staff by user ID
   */
  async getStaffByUser(userId: string): Promise<StaffProfile | null> {
    try {
      logger.debug('Fetching staff by user', { userId });

      const staff = await this.repository.getStaffByUser(userId);

      if (!staff) {
        return null;
      }

      return this.mapStaff(staff);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching staff by user', error as Error, { userId });
      throw new DatabaseError('Unexpected error fetching staff by user', error as Error);
    }
  }

  /**
   * Get staff by clinic ID
   */
  async getStaffByClinic(clinicId: string): Promise<StaffProfile[]> {
    try {
      logger.debug('Fetching staff by clinic', { clinicId });

      const staffList = await this.repository.getStaffByClinic(clinicId);
      return staffList.map(staff => this.mapStaff(staff));
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching staff by clinic', error as Error, { clinicId });
      throw new DatabaseError('Unexpected error fetching staff by clinic', error as Error);
    }
  }

  /**
   * Get staff by clinic and user ID
   */
  async getStaffByClinicAndUser(clinicId: string, userId: string): Promise<StaffProfile | null> {
    try {
      logger.debug('Fetching staff by clinic and user', { clinicId, userId });

      const staff = await this.repository.getStaffByClinicAndUser(clinicId, userId);

      if (!staff) {
        return null;
      }

      return this.mapStaff(staff);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching staff by clinic and user', error as Error, { clinicId, userId });
      throw new DatabaseError('Unexpected error fetching staff by clinic and user', error as Error);
    }
  }

  /**
   * Add staff to clinic
   * TODO: Should use RPC function for complex operations
   */
  async addStaff(dto: CreateStaffDTO): Promise<StaffProfile> {
    try {
      logger.debug('Adding staff to clinic', { dto });

      const staff = await this.repository.addStaff({
        clinic_id: dto.clinicId,
        user_id: dto.userId,
        role: dto.role,
        specialization: dto.specialization,
        license_number: dto.licenseNumber,
        working_hours: dto.workingHours,
        is_active: true,
      });

      logger.info('Staff added to clinic', { staffId: staff.id, clinicId: dto.clinicId });
      return this.mapStaff(staff);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error adding staff', error as Error, { dto });
      throw new DatabaseError('Unexpected error adding staff', error as Error);
    }
  }

  /**
   * Remove staff from clinic
   * TODO: Should use RPC function for soft delete or proper cleanup
   */
  async removeStaff(staffId: string): Promise<void> {
    try {
      logger.debug('Removing staff', { staffId });

      await this.repository.removeStaff(staffId);
      logger.info('Staff removed', { staffId });
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error removing staff', error as Error, { staffId });
      throw new DatabaseError('Unexpected error removing staff', error as Error);
    }
  }

  /**
   * Update staff information
   * TODO: Should use RPC function for complex updates
   */
  async updateStaff(staffId: string, data: Partial<StaffProfile>): Promise<StaffProfile> {
    try {
      logger.debug('Updating staff', { staffId, data });

      const updateData: Partial<import('./repositories/StaffRepository').StaffRow> = {};
      if (data.role) updateData.role = data.role;
      if (data.specialization !== undefined) updateData.specialization = data.specialization;
      if (data.licenseNumber !== undefined) updateData.license_number = data.licenseNumber;
      if (data.workingHours) updateData.working_hours = data.workingHours;
      if (data.averageConsultationDuration !== undefined) updateData.average_consultation_duration = data.averageConsultationDuration;
      if (data.isActive !== undefined) updateData.is_active = data.isActive;

      await this.repository.updateStaff(staffId, updateData);

      logger.info('Staff updated', { staffId });
      return this.getStaffById(staffId);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error updating staff', error as Error, { staffId, data });
      throw new DatabaseError('Unexpected error updating staff', error as Error);
    }
  }

  /**
   * Get staff by ID
   */
  async getStaffById(staffId: string): Promise<StaffProfile> {
    try {
      logger.debug('Fetching staff by ID', { staffId });

      const staff = await this.repository.getStaffById(staffId);
      return this.mapStaff(staff);
    } catch (error) {
      if (error instanceof DatabaseError) {
        if (error.message.includes('not found')) {
          throw new NotFoundError('Staff not found');
        }
        throw error;
      }
      logger.error('Unexpected error fetching staff by ID', error as Error, { staffId });
      throw new DatabaseError('Unexpected error fetching staff by ID', error as Error);
    }
  }

  /**
   * Map database row to StaffProfile object
   */
  private mapStaff(staff: import('./repositories/StaffRepository').StaffRow): StaffProfile {
    return {
      id: staff.id,
      clinicId: staff.clinic_id,
      userId: staff.user_id,
      role: staff.role,
      specialization: staff.specialization || undefined,
      licenseNumber: staff.license_number || undefined,
      workingHours: staff.working_hours as Record<string, unknown> | undefined,
      averageConsultationDuration: staff.average_consultation_duration || undefined,
      patientsPerDayAvg: staff.patients_per_day_avg || undefined,
      isActive: staff.is_active,
      createdAt: new Date(staff.created_at),
      updatedAt: new Date(staff.updated_at),
    };
  }
}

export const staffService = new StaffService();

