// src/services/patient/PatientService.ts
//
// SINGLE SOURCE OF TRUTH: all patient business logic lives in `@queuemed/core`
// (PatientService + PatientRepository), shared by the web app and the MCP/chat
// server. This file is a thin browser-side facade that wires core to the web
// Supabase client and preserves the existing web API surface (string→Date dates,
// web-typed shapes). No patient business logic lives here.

import type {
  Patient as CorePatient,
  PatientProfile as CorePatientProfile,
  WalkInPatient as CoreWalkInPatient,
} from '@queuemed/core';
import { coreContainer } from '../core/coreContainer';
import { NotFoundError, DatabaseError } from '../shared/errors';
import { logger } from '../shared/logging/Logger';
import { PatientSource } from './models/PatientModels';

// Shared core container (one event bus + notifier for the whole app).
const corePatient = coreContainer.patient;

// ============================================================================
// WEB-SPECIFIC TYPES (preserved for backward compat with existing consumers)
// ============================================================================

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

// ============================================================================
// FAÇADE
// ============================================================================

export class PatientService {
  /** For testing — allows injecting a mock core service. */
  constructor(private readonly core: typeof corePatient = corePatient) {}

  /**
   * Find or create a patient by phone number (walk-in flow).
   */
  async findOrCreatePatient(phoneNumber: string, fullName: string): Promise<FindOrCreatePatientResult> {
    try {
      return await this.core.findOrCreatePatient(phoneNumber, fullName);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error finding or creating patient', error as Error, { phoneNumber, fullName });
      throw new DatabaseError('Unexpected error finding or creating patient', error as Error);
    }
  }

  /**
   * Get patient profile by ID.
   */
  async getPatientProfile(patientId: string): Promise<PatientProfile> {
    try {
      const profile = await this.core.getPatientProfile(patientId);
      return this.toWebProfile(profile);
    } catch (error) {
      if (error instanceof NotFoundError) throw new NotFoundError('Patient not found');
      if (error instanceof DatabaseError) {
        if (error.message.includes('not found')) throw new NotFoundError('Patient not found');
        throw error;
      }
      logger.error('Unexpected error fetching patient profile', error as Error, { patientId });
      throw new DatabaseError('Unexpected error fetching patient profile', error as Error);
    }
  }

  /**
   * Update patient profile.
   */
  async updatePatientProfile(patientId: string, data: Partial<PatientProfile>): Promise<PatientProfile> {
    try {
      const updated = await this.core.updatePatientProfile(patientId, {
        fullName: data.fullName,
        phoneNumber: data.phoneNumber,
        email: data.email,
        city: data.city,
      });
      return this.toWebProfile(updated);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error updating patient profile', error as Error, { patientId, data });
      throw new DatabaseError('Unexpected error updating patient profile', error as Error);
    }
  }

  /**
   * Get walk-in patient by ID (decrypts PII).
   */
  async getWalkInPatient(patientId: string): Promise<WalkInPatient> {
    try {
      const patient = await this.core.getWalkInPatient(patientId);
      return this.toWebWalkIn(patient);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      if (error instanceof Error && error.message.includes('not found')) {
        throw new NotFoundError('Walk-in patient not found');
      }
      logger.error('Unexpected error fetching walk-in patient', error as Error, { patientId });
      throw new DatabaseError('Unexpected error fetching walk-in patient', error as Error);
    }
  }

  /** Map a core PatientProfile/Patient to the web profile shape (string → Date). */
  private toWebProfile(core: CorePatientProfile | CorePatient): PatientProfile {
    const profile = core as CorePatientProfile;
    const now = new Date();
    return {
      id: core.id,
      phoneNumber: core.phoneNumber || '',
      fullName: core.fullName,
      email: core.email || undefined,
      city: core.city || undefined,
      preferredLanguage: profile.preferredLanguage || undefined,
      notificationPreferences: profile.notificationPreferences,
      noShowCount: profile.noShowCount ?? 0,
      createdAt: core.createdAt ? new Date(core.createdAt) : now,
      updatedAt: core.updatedAt ? new Date(core.updatedAt) : now,
    };
  }

  /** Map a core WalkInPatient to the web shape (string → Date, source → enum). */
  private toWebWalkIn(core: CoreWalkInPatient): WalkInPatient {
    return {
      id: core.id,
      phoneNumber: core.phoneNumber,
      fullName: core.fullName,
      source: core.source as PatientSource,
      isClaimed: core.isClaimed,
      claimedBy: core.claimedBy || undefined,
      createdAt: core.createdAt ? new Date(core.createdAt) : new Date(),
      updatedAt: core.updatedAt ? new Date(core.updatedAt) : new Date(),
    };
  }
}

export const patientService = new PatientService();
