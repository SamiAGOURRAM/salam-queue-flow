/**
 * Patient Service
 * Handles all patient-related operations
 * Uses repository pattern - NO direct Supabase client usage
 */

import { PatientRepository } from './repositories/PatientRepository';
import { logger } from '../shared/logging/Logger';
import { NotFoundError, ValidationError, DatabaseError } from '../shared/errors';

export interface PatientProfile {
  id: string;
  phoneNumber: string;
  fullName: string;
  email?: string;
  preferredLanguage?: string;
  notificationPreferences?: Record<string, unknown>;
  noShowCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface GuestPatient {
  id: string;
  phoneNumber: string;
  fullName: string;
  claimedBy?: string;
  claimedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface FindOrCreatePatientResult {
  patientId: string | null;
  guestPatientId: string | null;
  isGuest: boolean;
  isNew: boolean;
}

export class PatientService {
  private repository: PatientRepository;

  constructor(repository?: PatientRepository) {
    this.repository = repository || new PatientRepository();
  }

  /**
   * Find or create a patient by phone number
   * First checks registered patients, then guest patients
   * Creates new guest patient if neither exists
   */
  async findOrCreatePatient(phoneNumber: string, fullName: string): Promise<FindOrCreatePatientResult> {
    try {
      logger.debug('Finding or creating patient', { phoneNumber, fullName });

      // Step 1: Check for registered patient (via repository)
      const registeredPatient = await this.repository.findPatientByPhone(phoneNumber);

      if (registeredPatient) {
        logger.info('Found registered patient', { patientId: registeredPatient.id, phoneNumber });
        return {
          patientId: registeredPatient.id,
          guestPatientId: null,
          isGuest: false,
          isNew: false,
        };
      }

      // Step 2: Check for existing guest patient (via repository)
      const existingGuest = await this.repository.findGuestPatientByPhone(phoneNumber);

      if (existingGuest) {
        logger.info('Found existing guest patient', { guestPatientId: existingGuest.id, phoneNumber });
        return {
          patientId: null,
          guestPatientId: existingGuest.id,
          isGuest: true,
          isNew: false,
        };
      }

      // Step 3: Create new guest patient (via repository)
      const newGuest = await this.repository.createGuestPatient(fullName, phoneNumber);

      logger.info('Created new guest patient', { guestPatientId: newGuest.id, phoneNumber, fullName });
      return {
        patientId: null,
        guestPatientId: newGuest.id,
        isGuest: true,
        isNew: true,
      };
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error finding or creating patient', error as Error, { phoneNumber, fullName });
      throw new DatabaseError('Unexpected error finding or creating patient', error as Error);
    }
  }

  /**
   * Get patient profile by ID
   */
  async getPatientProfile(patientId: string): Promise<PatientProfile> {
    try {
      logger.debug('Fetching patient profile', { patientId });

      const profile = await this.repository.getPatientProfile(patientId);

      return {
        id: profile.id,
        phoneNumber: profile.phone_number,
        fullName: profile.full_name,
        email: profile.email || undefined,
        preferredLanguage: profile.preferred_language || undefined,
        notificationPreferences: profile.notification_preferences as Record<string, unknown> | undefined,
        noShowCount: profile.no_show_count || 0,
        createdAt: new Date(profile.created_at),
        updatedAt: new Date(profile.updated_at),
      };
    } catch (error) {
      if (error instanceof DatabaseError) {
        if (error.message.includes('not found')) {
          throw new NotFoundError('Patient not found');
        }
        throw error;
      }
      logger.error('Unexpected error fetching patient profile', error as Error, { patientId });
      throw new DatabaseError('Unexpected error fetching patient profile', error as Error);
    }
  }

  /**
   * Update patient profile
   * TODO: Should use RPC function for complex updates
   */
  async updatePatientProfile(patientId: string, data: Partial<PatientProfile>): Promise<PatientProfile> {
    try {
      logger.debug('Updating patient profile', { patientId, data });

      const updateData: Partial<import('./repositories/PatientRepository').PatientProfileRow> = {};
      if (data.fullName) updateData.full_name = data.fullName;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.preferredLanguage) updateData.preferred_language = data.preferredLanguage;
      if (data.notificationPreferences) updateData.notification_preferences = data.notificationPreferences as Record<string, unknown> | null;

      await this.repository.updatePatientProfile(patientId, updateData);

      logger.info('Patient profile updated', { patientId });
      return this.getPatientProfile(patientId);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error updating patient profile', error as Error, { patientId, data });
      throw new DatabaseError('Unexpected error updating patient profile', error as Error);
    }
  }

  /**
   * Get guest patient by ID
   */
  async getGuestPatient(guestPatientId: string): Promise<GuestPatient> {
    try {
      logger.debug('Fetching guest patient', { guestPatientId });

      const guest = await this.repository.getGuestPatient(guestPatientId);

      return {
        id: guest.id,
        phoneNumber: guest.phone_number,
        fullName: guest.full_name,
        claimedBy: guest.claimed_by || undefined,
        claimedAt: guest.claimed_at ? new Date(guest.claimed_at) : undefined,
        createdAt: new Date(guest.created_at),
        updatedAt: new Date(guest.updated_at),
      };
    } catch (error) {
      if (error instanceof DatabaseError) {
        if (error.message.includes('not found')) {
          throw new NotFoundError('Guest patient not found');
        }
        throw error;
      }
      logger.error('Unexpected error fetching guest patient', error as Error, { guestPatientId });
      throw new DatabaseError('Unexpected error fetching guest patient', error as Error);
    }
  }
}

export const patientService = new PatientService();

