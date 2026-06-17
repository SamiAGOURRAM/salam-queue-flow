/**
 * Patient Service - Business logic for patient management
 */

import type { IPatientRepository } from '../../ports/repositories/IPatientRepository.js';
import type { ILogger } from '../../ports/logger.js';
import type { Patient, PatientProfile, QueueEntry, WalkInPatient, FindOrCreatePatientResult } from '../../types.js';
import { NotFoundError } from '../../errors.js';
import { BaseService } from '../BaseService.js';

export class PatientService extends BaseService {
  constructor(
    private readonly repository: IPatientRepository,
    logger: ILogger
  ) {
    super(logger);
  }

  /**
   * Get patient by ID
   */
  async getPatient(patientId: string): Promise<Patient> {
    return this.executeWithLogging('getPatient', {
      service: 'PatientService',
      userId: patientId,
    }, async () => {
      this.logger.debug('Fetching patient');
      const patient = await this.repository.getById(patientId);
      if (!patient) {
        throw new NotFoundError('Patient', patientId);
      }
      this.logger.info('Patient fetched');
      return patient;
    });
  }

  /**
   * Get patient by phone number
   */
  async getPatientByPhone(phoneNumber: string): Promise<Patient | null> {
    return this.executeWithLogging('getPatientByPhone', {
      service: 'PatientService',
    }, async () => {
      this.logger.debug('Fetching patient by phone');
      const patient = await this.repository.getByPhoneNumber(phoneNumber);
      return patient;
    });
  }

  /**
   * Get patient profile with extended information
   */
  async getPatientProfile(patientId: string): Promise<PatientProfile> {
    return this.executeWithLogging('getPatientProfile', {
      service: 'PatientService',
      userId: patientId,
    }, async () => {
      this.logger.debug('Fetching patient profile');
      const profile = await this.repository.getProfile(patientId);
      if (!profile) {
        throw new NotFoundError('Patient', patientId);
      }
      this.logger.info('Patient profile fetched');
      return profile;
    });
  }

  /**
   * Get patient's appointments
   */
  async getPatientAppointments(
    patientId: string,
    options?: {
      status?: string;
      fromDate?: string;
      toDate?: string;
      limit?: number;
    }
  ): Promise<QueueEntry[]> {
    return this.executeWithLogging('getPatientAppointments', {
      service: 'PatientService',
      userId: patientId,
      ...(options ? { options } : {}),
    }, async () => {
      this.logger.debug('Fetching patient appointments', options);
      const appointments = await this.repository.getAppointments(patientId, options);
      this.logger.info('Patient appointments fetched', { count: appointments.length });
      return appointments;
    });
  }

  /**
   * Get upcoming appointments for a patient
   */
  async getUpcomingAppointments(patientId: string, limit?: number): Promise<QueueEntry[]> {
    return this.executeWithLogging('getUpcomingAppointments', {
      service: 'PatientService',
      userId: patientId,
      ...(limit !== undefined ? { limit } : {}),
    }, async () => {
      this.logger.debug('Fetching upcoming appointments');
      const appointments = await this.repository.getUpcomingAppointments(patientId, limit);
      this.logger.info('Upcoming appointments fetched', { count: appointments.length });
      return appointments;
    });
  }

  /**
   * Update patient profile
   */
  async updatePatientProfile(
    patientId: string,
    updates: Partial<Patient>
  ): Promise<Patient> {
    return this.executeWithLogging('updatePatientProfile', {
      service: 'PatientService',
      userId: patientId,
    }, async () => {
      this.logger.info('Updating patient profile');
      const patient = await this.repository.updateProfile(patientId, updates);
      this.logger.info('Patient profile updated');
      return patient;
    });
  }

  /**
   * Resolve a patient by phone, creating a walk-in record if none exists.
   * SSOT for the booking walk-in flow — shared by the web UI and the agent.
   * iii-style use-case id: `patient::find-or-create`.
   */
  async findOrCreatePatient(phoneNumber: string, fullName: string): Promise<FindOrCreatePatientResult> {
    return this.executeWithLogging('findOrCreatePatient', {
      service: 'PatientService',
      useCase: 'patient::find-or-create',
    }, async () => {
      const existing = await this.repository.findByPhoneRpc(phoneNumber);
      if (existing) {
        this.logger.info('Found existing patient by phone', { patientId: existing.id, isClaimed: existing.isClaimed });
        return { patientId: existing.id, isNew: false };
      }

      const created = await this.repository.createWalkInPatient(fullName, phoneNumber);
      this.logger.info('Created new walk-in patient', { patientId: created.id });
      return { patientId: created.id, isNew: true };
    });
  }

  /**
   * Get a walk-in patient by id (PII decrypted at the adapter).
   */
  async getWalkInPatient(patientId: string): Promise<WalkInPatient> {
    return this.executeWithLogging('getWalkInPatient', {
      service: 'PatientService',
      userId: patientId,
    }, async () => {
      this.logger.debug('Fetching walk-in patient');
      const patient = await this.repository.getWalkInPatient(patientId);
      this.logger.info('Walk-in patient fetched');
      return patient;
    });
  }
}

