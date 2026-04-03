/**
 * Clinic Service
 * Handles all clinic-related operations
 * Uses repository pattern - NO direct Supabase client usage
 */

import { ClinicRepository } from './repositories/ClinicRepository';
import { logger } from '../shared/logging/Logger';
import { NotFoundError, ValidationError, DatabaseError } from '../shared/errors';

export interface Clinic {
  id: string;
  name: string;
  nameAr?: string;
  ownerId: string;
  practiceType: string;
  specialty: string;
  address: string;
  city: string;
  phone: string;
  email?: string;
  logoUrl?: string;
  settings: ClinicSettings;
  subscriptionTier: string;
  isActive: boolean;
  queueMode?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClinicSettings {
  buffer_time?: number;
  working_hours?: Record<string, {
    open?: string;
    close?: string;
    closed?: boolean;
  }>;
  allow_walk_ins?: boolean;
  max_queue_size?: number;
  requires_appointment?: boolean;
  average_appointment_duration?: number;
  appointment_types?: Array<{
    name: string;
    label: string;
    duration: number;
    price?: number;
  }>;
  payment_methods?: {
    cash?: boolean;
    card?: boolean;
    online?: boolean;
    insurance?: boolean;
  };
}

export class ClinicService {
  private repository: ClinicRepository;

  constructor(repository?: ClinicRepository) {
    this.repository = repository || new ClinicRepository();
  }

  /**
   * Get clinic by ID
   */
  async getClinic(clinicId: string): Promise<Clinic> {
    try {
      logger.debug('Fetching clinic', { clinicId });

      const clinic = await this.repository.getClinic(clinicId);
      return this.mapClinic(clinic);
    } catch (error) {
      if (error instanceof DatabaseError) {
        if (error.message.includes('not found')) {
          throw new NotFoundError('Clinic not found');
        }
        throw error;
      }
      logger.error('Unexpected error fetching clinic', error as Error, { clinicId });
      throw new DatabaseError('Unexpected error fetching clinic', error as Error);
    }
  }

  /**
   * Get clinic by owner ID
   */
  async getClinicByOwner(ownerId: string): Promise<Clinic | null> {
    try {
      logger.debug('Fetching clinic by owner', { ownerId });

      const clinic = await this.repository.getClinicByOwner(ownerId);

      if (!clinic) {
        return null;
      }

      return this.mapClinic(clinic);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching clinic by owner', error as Error, { ownerId });
      throw new DatabaseError('Unexpected error fetching clinic by owner', error as Error);
    }
  }

  /**
   * Get clinic settings
   */
  async getClinicSettings(clinicId: string): Promise<ClinicSettings> {
    try {
      logger.debug('Fetching clinic settings', { clinicId });

      const settings = await this.repository.getClinicSettings(clinicId);
      return this.normalizeClinicSettings(settings);
    } catch (error) {
      if (error instanceof DatabaseError) {
        if (error.message.includes('not found')) {
          throw new NotFoundError('Clinic not found');
        }
        throw error;
      }
      logger.error('Unexpected error fetching clinic settings', error as Error, { clinicId });
      throw new DatabaseError('Unexpected error fetching clinic settings', error as Error);
    }
  }

  /**
   * Update clinic settings
   * TODO: Should use RPC function for complex updates
   */
  async updateClinicSettings(clinicId: string, settings: Partial<ClinicSettings>): Promise<ClinicSettings> {
    try {
      logger.debug('Updating clinic settings', { clinicId, settings });

      // Get current settings
      const currentSettings = await this.getClinicSettings(clinicId);
      const updatedSettings = {
        ...currentSettings,
        ...this.normalizeClinicSettings(settings as Record<string, unknown>),
      };

      await this.repository.updateClinicSettings(clinicId, updatedSettings as Record<string, unknown>);

      logger.info('Clinic settings updated', { clinicId });
      return updatedSettings;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error updating clinic settings', error as Error, { clinicId, settings });
      throw new DatabaseError('Unexpected error updating clinic settings', error as Error);
    }
  }

  /**
   * Update clinic information
   * TODO: Should use RPC function for complex updates
   */
  async updateClinic(clinicId: string, data: Partial<Clinic>): Promise<Clinic> {
    try {
      logger.debug('Updating clinic', { clinicId, data });

      const updateData: Partial<import('./repositories/ClinicRepository').ClinicRow> = {};
      if (data.name) updateData.name = data.name;
      if (data.nameAr !== undefined) updateData.name_ar = data.nameAr;
      if (data.specialty) updateData.specialty = data.specialty;
      if (data.address) updateData.address = data.address;
      if (data.city) updateData.city = data.city;
      if (data.phone) updateData.phone = data.phone;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.logoUrl !== undefined) updateData.logo_url = data.logoUrl;
      if (data.isActive !== undefined) updateData.is_active = data.isActive;

      await this.repository.updateClinic(clinicId, updateData);

      logger.info('Clinic updated', { clinicId });
      return this.getClinic(clinicId);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error updating clinic', error as Error, { clinicId, data });
      throw new DatabaseError('Unexpected error updating clinic', error as Error);
    }
  }

  /**
   * Map database row to Clinic object
   */
  private mapClinic(clinic: import('./repositories/ClinicRepository').ClinicRow): Clinic {
    return {
      id: clinic.id,
      name: clinic.name,
      nameAr: clinic.name_ar || undefined,
      ownerId: clinic.owner_id,
      practiceType: clinic.practice_type,
      specialty: clinic.specialty,
      address: clinic.address,
      city: clinic.city,
      phone: clinic.phone,
      email: clinic.email || undefined,
      logoUrl: clinic.logo_url || undefined,
      settings: this.normalizeClinicSettings(clinic.settings),
      subscriptionTier: clinic.subscription_tier,
      isActive: clinic.is_active,
      queueMode: clinic.queue_mode,
      createdAt: new Date(clinic.created_at),
      updatedAt: new Date(clinic.updated_at),
    };
  }

  private normalizeClinicSettings(raw: unknown): ClinicSettings {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {};
    }

    const settings = raw as Record<string, unknown>;
    const normalized: Record<string, unknown> = { ...settings };

    // Remove legacy camelCase keys to enforce canonical snake_case contract.
    delete normalized.bufferTime;
    delete normalized.workingHours;
    delete normalized.allowWalkIns;
    delete normalized.maxQueueSize;
    delete normalized.requiresAppointment;
    delete normalized.averageAppointmentDuration;
    delete normalized.appointmentTypes;
    delete normalized.paymentMethods;

    if ('working_hours' in settings) {
      const workingHoursValue = settings.working_hours;
      if (workingHoursValue && typeof workingHoursValue === 'object' && !Array.isArray(workingHoursValue)) {
        normalized.working_hours = workingHoursValue;
      } else {
        delete normalized.working_hours;
      }
    }

    if ('buffer_time' in settings) {
      if (typeof settings.buffer_time === 'number') {
        normalized.buffer_time = settings.buffer_time;
      } else {
        delete normalized.buffer_time;
      }
    }

    if ('allow_walk_ins' in settings) {
      if (typeof settings.allow_walk_ins === 'boolean') {
        normalized.allow_walk_ins = settings.allow_walk_ins;
      } else {
        delete normalized.allow_walk_ins;
      }
    }

    if ('max_queue_size' in settings) {
      if (typeof settings.max_queue_size === 'number') {
        normalized.max_queue_size = settings.max_queue_size;
      } else {
        delete normalized.max_queue_size;
      }
    }

    if ('requires_appointment' in settings) {
      if (typeof settings.requires_appointment === 'boolean') {
        normalized.requires_appointment = settings.requires_appointment;
      } else {
        delete normalized.requires_appointment;
      }
    }

    if ('average_appointment_duration' in settings) {
      if (typeof settings.average_appointment_duration === 'number') {
        normalized.average_appointment_duration = settings.average_appointment_duration;
      } else {
        delete normalized.average_appointment_duration;
      }
    }

    if ('appointment_types' in settings) {
      if (Array.isArray(settings.appointment_types)) {
        normalized.appointment_types = settings.appointment_types;
      } else {
        delete normalized.appointment_types;
      }
    }

    if ('payment_methods' in settings) {
      const paymentMethodsValue = settings.payment_methods;
      if (paymentMethodsValue && typeof paymentMethodsValue === 'object' && !Array.isArray(paymentMethodsValue)) {
        normalized.payment_methods = paymentMethodsValue;
      } else {
        delete normalized.payment_methods;
      }
    }

    return normalized as ClinicSettings;
  }
}

export const clinicService = new ClinicService();

