/**
 * Patient Service
 * Handles all patient-related operations
 * Uses repository pattern - NO direct Supabase client usage
 */

import { PatientRepository } from './repositories/PatientRepository';
import { logger } from '../shared/logging/Logger';
import { NotFoundError, ValidationError, DatabaseError } from '../shared/errors';
import { PatientSource } from './models/PatientModels';

export interface PatientProfile {
  id: string;
  phoneNumber: string;
  fullName: string;
  email?: string;
  city?: string;
  preferredLanguage?: string;
  notificationPreferences?: Record<string, unknown>;
  noShowCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalkInPatient {
  id: string;
  phoneNumber: string;
  fullName: string;
  source: PatientSource;
  isClaimed: boolean;
  claimedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FindOrCreatePatientResult {
  patientId: string | null;
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
          isNew: false,
        };
      }

      // Step 2: Check for existing walk-in patient (via repository)
      const existingWalkIn = await this.repository.findWalkInPatientByPhone(phoneNumber);

      if (existingWalkIn) {
        logger.info('Found existing walk-in patient', { patientId: existingWalkIn.id, phoneNumber });
        return {
          patientId: existingWalkIn.id,
          isNew: false,
        };
      }

      // Step 3: Create new walk-in patient (via repository)
      const newWalkIn = await this.repository.createWalkInPatient(fullName, phoneNumber);

      logger.info('Created new walk-in patient', { patientId: newWalkIn.id, phoneNumber, fullName });
      return {
        patientId: newWalkIn.id,
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
        city: profile.city || undefined,
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
      if (data.phoneNumber) updateData.phone_number = data.phoneNumber;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.city !== undefined) updateData.city = data.city || null;
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
   * Get walk-in patient by ID (decrypts PII)
   */
  async getWalkInPatient(patientId: string): Promise<WalkInPatient> {
    try {
      logger.debug('Fetching walk-in patient', { patientId });

      const patient = await this.repository.getWalkInPatient(patientId);

      return {
        id: patient.id,
        phoneNumber: patient.phone_number,
        fullName: patient.full_name,
        source: patient.source as PatientSource,
        isClaimed: patient.is_claimed,
        claimedBy: patient.claimed_by || undefined,
        createdAt: new Date(patient.created_at),
        updatedAt: new Date(patient.updated_at),
      };
    } catch (error) {
      if (error instanceof DatabaseError) {
        if (error.message.includes('not found')) {
          throw new NotFoundError('Walk-in patient not found');
        }
        throw error;
      }
      logger.error('Unexpected error fetching walk-in patient', error as Error, { patientId });
      throw new DatabaseError('Unexpected error fetching walk-in patient', error as Error);
    }
  }
}

export const patientService = new PatientService();

