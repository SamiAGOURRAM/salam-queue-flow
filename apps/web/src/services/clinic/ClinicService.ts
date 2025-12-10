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
  operatingMode: string;
  estimationMode: string;
  mlEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClinicSettings {
  bufferTime?: number;
  workingHours?: Record<string, {
    open?: string;
    close?: string;
    closed?: boolean;
  }>;
  allowWalkIns?: boolean;
  maxQueueSize?: number;
  requiresAppointment?: boolean;
  averageAppointmentDuration?: number;
  appointmentTypes?: Array<{
    name: string;
    label: string;
    duration: number;
    price?: number;
  }>;
  paymentMethods?: {
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
      return (settings as ClinicSettings) || {};
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
      const updatedSettings = { ...currentSettings, ...settings };

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
      settings: (clinic.settings as ClinicSettings) || {},
      subscriptionTier: clinic.subscription_tier,
      isActive: clinic.is_active,
      operatingMode: clinic.operating_mode,
      estimationMode: clinic.estimation_mode,
      mlEnabled: clinic.ml_enabled || false,
      createdAt: new Date(clinic.created_at),
      updatedAt: new Date(clinic.updated_at),
    };
  }
}

export const clinicService = new ClinicService();

