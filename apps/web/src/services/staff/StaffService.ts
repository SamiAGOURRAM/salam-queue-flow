/**
 * Staff Service
 * Handles all staff-related operations
 * Uses repository pattern - NO direct Supabase client usage
 */

import { StaffRepository } from './repositories/StaffRepository';
import type { Json } from '@/integrations/supabase/types';
import { logger } from '../shared/logging/Logger';
import { NotFoundError, ValidationError, DatabaseError } from '../shared/errors';

export interface StaffAppointmentType {
  name: string;
  label: string;
  duration: number;
  price?: number;
}

export type StaffQueueModeOverride = 'fluid' | 'slotted' | 'hybrid';

export type StaffDailyQueueModesOverride = Partial<Record<
  'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday',
  StaffQueueModeOverride
>>;

export interface StaffProfile {
  id: string;
  clinicId: string;
  userId: string;
  role: string;
  specialization?: string;
  licenseNumber?: string;
  workingHours?: Record<string, unknown>;
  appointmentTypesOverride?: StaffAppointmentType[];
  dailyQueueModesOverride?: StaffDailyQueueModesOverride;
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
  workingHours?: Record<string, unknown> | null;
  appointmentTypesOverride?: StaffAppointmentType[] | null;
  dailyQueueModesOverride?: StaffDailyQueueModesOverride | null;
}

export interface UpdateDoctorOverridesDTO {
  workingHours?: Record<string, unknown> | null;
  appointmentTypesOverride?: StaffAppointmentType[] | null;
  dailyQueueModesOverride?: StaffDailyQueueModesOverride | null;
}

export type StaffQueueScopeMode = 'clinic' | 'provider' | 'restricted';

export interface StaffQueueScope {
  clinicId: string;
  requesterStaffId?: string;
  scopeMode: StaffQueueScopeMode;
  isClinicWide: boolean;
  isOwner: boolean;
  isProvider: boolean;
  allowedStaffIds: string[];
}

export interface StaffQueueAssignments {
  clinicId: string;
  staffId: string;
  assignedStaffIds: string[];
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
        working_hours: (dto.workingHours as Json | undefined) ?? null,
        appointment_types_override: this.toAppointmentTypesOverrideJson(dto.appointmentTypesOverride),
        daily_queue_modes_override: this.toDailyQueueModesOverrideJson(dto.dailyQueueModesOverride),
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
      if (data.workingHours !== undefined) updateData.working_hours = (data.workingHours as Json | null) ?? null;
      if (data.appointmentTypesOverride !== undefined) {
        updateData.appointment_types_override = this.toAppointmentTypesOverrideJson(data.appointmentTypesOverride);
      }
      if (data.dailyQueueModesOverride !== undefined) {
        updateData.daily_queue_modes_override = this.toDailyQueueModesOverrideJson(data.dailyQueueModesOverride);
      }
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

  async updateDoctorOverrides(staffId: string, data: UpdateDoctorOverridesDTO): Promise<StaffProfile> {
    if (!staffId?.trim()) {
      throw new ValidationError('Staff ID is required');
    }

    try {
      logger.debug('Updating doctor overrides', { staffId, data });

      const staff = await this.repository.updateDoctorOverrides(staffId, {
        working_hours: (data.workingHours as Json | null) ?? null,
        appointment_types_override: this.toAppointmentTypesOverrideJson(data.appointmentTypesOverride),
        daily_queue_modes_override: this.toDailyQueueModesOverrideJson(data.dailyQueueModesOverride),
      });

      logger.info('Doctor overrides updated', { staffId });
      return this.mapStaff(staff);
    } catch (error) {
      if (error instanceof DatabaseError || error instanceof ValidationError) throw error;
      logger.error('Unexpected error updating doctor overrides', error as Error, { staffId, data });
      throw new DatabaseError('Unexpected error updating doctor overrides', error as Error);
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

  async resolveQueueScope(staffId: string): Promise<StaffQueueScope> {
    if (!staffId?.trim()) {
      throw new ValidationError('Staff ID is required');
    }

    try {
      logger.debug('Resolving queue scope for staff', { staffId });
      const rawScope = await this.repository.resolveQueueScope(staffId);
      return this.mapQueueScope(rawScope);
    } catch (error) {
      if (error instanceof DatabaseError || error instanceof ValidationError) throw error;
      logger.error('Unexpected error resolving queue scope for staff', error as Error, { staffId });
      throw new DatabaseError('Unexpected error resolving queue scope for staff', error as Error);
    }
  }

  async replaceQueueAssignments(staffId: string, assignedStaffIds: string[]): Promise<StaffQueueAssignments> {
    if (!staffId?.trim()) {
      throw new ValidationError('Staff ID is required');
    }

    const normalizedAssignedStaffIds = Array.from(
      new Set((assignedStaffIds || []).filter((id): id is string => typeof id === 'string' && id.length > 0))
    );

    try {
      logger.debug('Replacing queue assignments for staff', {
        staffId,
        assignedStaffCount: normalizedAssignedStaffIds.length,
      });

      const payload = await this.repository.replaceQueueAssignments(staffId, normalizedAssignedStaffIds);

      return {
        clinicId: typeof payload.clinic_id === 'string' ? payload.clinic_id : '',
        staffId: typeof payload.staff_id === 'string' ? payload.staff_id : staffId,
        assignedStaffIds: this.extractStringArray(payload.assigned_staff_ids),
      };
    } catch (error) {
      if (error instanceof DatabaseError || error instanceof ValidationError) throw error;
      logger.error('Unexpected error replacing queue assignments', error as Error, {
        staffId,
        assignedStaffCount: normalizedAssignedStaffIds.length,
      });
      throw new DatabaseError('Unexpected error replacing queue assignments', error as Error);
    }
  }

  async getQueueAssignmentsByClinic(clinicId: string): Promise<Record<string, string[]>> {
    if (!clinicId?.trim()) {
      throw new ValidationError('Clinic ID is required');
    }

    try {
      logger.debug('Fetching queue assignments by clinic', { clinicId });
      const rows = await this.repository.getQueueAssignmentsByClinic(clinicId);
      return rows.reduce<Record<string, string[]>>((acc, row) => {
        if (!acc[row.staff_id]) {
          acc[row.staff_id] = [];
        }
        acc[row.staff_id].push(row.assigned_staff_id);
        return acc;
      }, {});
    } catch (error) {
      if (error instanceof DatabaseError || error instanceof ValidationError) throw error;
      logger.error('Unexpected error fetching queue assignments by clinic', error as Error, { clinicId });
      throw new DatabaseError('Unexpected error fetching queue assignments by clinic', error as Error);
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
      workingHours: this.toObjectRecord(staff.working_hours),
      appointmentTypesOverride: this.parseAppointmentTypesOverride(staff.appointment_types_override),
      dailyQueueModesOverride: this.parseDailyQueueModesOverride(staff.daily_queue_modes_override),
      averageConsultationDuration: staff.average_consultation_duration || undefined,
      patientsPerDayAvg: staff.patients_per_day_avg || undefined,
      isActive: staff.is_active,
      createdAt: new Date(staff.created_at),
      updatedAt: new Date(staff.updated_at),
    };
  }

  private toObjectRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return value as Record<string, unknown>;
  }

  private toAppointmentTypesOverrideJson(value: StaffAppointmentType[] | null | undefined): Json | null {
    if (!Array.isArray(value)) {
      return null;
    }

    const normalized = value
      .filter((entry): entry is StaffAppointmentType =>
        Boolean(entry)
        && typeof entry.name === 'string'
        && entry.name.trim().length > 0
        && typeof entry.label === 'string'
        && entry.label.trim().length > 0
        && typeof entry.duration === 'number'
        && Number.isFinite(entry.duration)
      )
      .map((entry) => {
        const row: { [key: string]: Json } = {
          name: entry.name,
          label: entry.label,
          duration: entry.duration,
        };

        if (typeof entry.price === 'number' && Number.isFinite(entry.price)) {
          row.price = entry.price;
        }

        return row;
      });

    return normalized.length > 0 ? normalized : null;
  }

  private toDailyQueueModesOverrideJson(value: StaffDailyQueueModesOverride | null | undefined): Json | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const dayKeys: Array<keyof StaffDailyQueueModesOverride> = [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ];

    const parsed: { [key: string]: Json } = {};

    dayKeys.forEach((dayKey) => {
      const mode = value[dayKey];
      if (mode === 'fluid' || mode === 'slotted' || mode === 'hybrid') {
        parsed[dayKey] = mode;
      }
    });

    return Object.keys(parsed).length > 0 ? parsed : null;
  }

  private parseAppointmentTypesOverride(value: unknown): StaffAppointmentType[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const parsed = value
      .filter((entry): entry is Record<string, unknown> =>
        Boolean(entry)
        && typeof entry === 'object'
        && !Array.isArray(entry)
        && typeof entry.name === 'string'
        && typeof entry.duration === 'number'
      )
      .map((entry) => ({
        name: entry.name as string,
        label: typeof entry.label === 'string' ? entry.label : (entry.name as string),
        duration: entry.duration as number,
        price: typeof entry.price === 'number' ? entry.price : undefined,
      }));

    return parsed.length > 0 ? parsed : undefined;
  }

  private parseDailyQueueModesOverride(value: unknown): StaffDailyQueueModesOverride | undefined {
    const record = this.toObjectRecord(value);
    if (!record) {
      return undefined;
    }

    const dayKeys: Array<keyof StaffDailyQueueModesOverride> = [
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
      'sunday',
    ];

    const parsed = dayKeys.reduce<StaffDailyQueueModesOverride>((acc, dayKey) => {
      const mode = record[dayKey];
      if (mode === 'fluid' || mode === 'slotted' || mode === 'hybrid') {
        acc[dayKey] = mode;
      }
      return acc;
    }, {});

    return Object.keys(parsed).length > 0 ? parsed : undefined;
  }

  private mapQueueScope(scope: Record<string, unknown>): StaffQueueScope {
    const scopeMode = scope.scope_mode;
    const normalizedScopeMode: StaffQueueScopeMode =
      scopeMode === 'provider' || scopeMode === 'restricted' ? scopeMode : 'clinic';

    return {
      clinicId: typeof scope.clinic_id === 'string' ? scope.clinic_id : '',
      requesterStaffId: typeof scope.requester_staff_id === 'string' ? scope.requester_staff_id : undefined,
      scopeMode: normalizedScopeMode,
      isClinicWide: typeof scope.is_clinic_wide === 'boolean'
        ? scope.is_clinic_wide
        : normalizedScopeMode === 'clinic',
      isOwner: Boolean(scope.is_owner),
      isProvider: Boolean(scope.is_provider),
      allowedStaffIds: this.extractStringArray(scope.allowed_staff_ids),
    };
  }

  private extractStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  }
}

export const staffService = new StaffService();

