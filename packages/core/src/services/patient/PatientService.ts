/**
 * Patient Service - Business logic for patient management
 */

import type { PatientRepository } from '../../repositories/patient/PatientRepository';
import type { ILogger } from '../../ports/logger';
import type { Patient, PatientProfile, QueueEntry } from '../../types';
import { NotFoundError } from '../../errors';

export class PatientService {
  constructor(
    private readonly repository: PatientRepository,
    private readonly logger: ILogger
  ) {}

  /**
   * Get patient by ID
   */
  async getPatient(patientId: string): Promise<Patient> {
    this.logger.setContext({
      service: 'PatientService',
      operation: 'getPatient',
      userId: patientId
    });

    try {
      this.logger.debug('Fetching patient');
      const patient = await this.repository.getById(patientId);

      if (!patient) {
        throw new NotFoundError('Patient', patientId);
      }

      this.logger.info('Patient fetched');
      return patient;
    } catch (error) {
      this.logger.error('Failed to get patient', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Get patient by phone number
   */
  async getPatientByPhone(phoneNumber: string): Promise<Patient | null> {
    this.logger.setContext({
      service: 'PatientService',
      operation: 'getPatientByPhone'
    });

    try {
      this.logger.debug('Fetching patient by phone');
      const patient = await this.repository.getByPhoneNumber(phoneNumber);
      return patient;
    } catch (error) {
      this.logger.error('Failed to get patient by phone', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Get patient profile with extended information
   */
  async getPatientProfile(patientId: string): Promise<PatientProfile> {
    this.logger.setContext({
      service: 'PatientService',
      operation: 'getPatientProfile',
      userId: patientId
    });

    try {
      this.logger.debug('Fetching patient profile');
      const profile = await this.repository.getProfile(patientId);

      if (!profile) {
        throw new NotFoundError('Patient', patientId);
      }

      this.logger.info('Patient profile fetched');
      return profile;
    } catch (error) {
      this.logger.error('Failed to get patient profile', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
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
    this.logger.setContext({
      service: 'PatientService',
      operation: 'getPatientAppointments',
      userId: patientId
    });

    try {
      this.logger.debug('Fetching patient appointments', options);
      const appointments = await this.repository.getAppointments(patientId, options);
      this.logger.info('Patient appointments fetched', { count: appointments.length });
      return appointments;
    } catch (error) {
      this.logger.error('Failed to get patient appointments', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Get upcoming appointments for a patient
   */
  async getUpcomingAppointments(patientId: string, limit?: number): Promise<QueueEntry[]> {
    this.logger.setContext({
      service: 'PatientService',
      operation: 'getUpcomingAppointments',
      userId: patientId
    });

    try {
      this.logger.debug('Fetching upcoming appointments');
      const appointments = await this.repository.getUpcomingAppointments(patientId, limit);
      this.logger.info('Upcoming appointments fetched', { count: appointments.length });
      return appointments;
    } catch (error) {
      this.logger.error('Failed to get upcoming appointments', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Update patient profile
   */
  async updatePatientProfile(
    patientId: string,
    updates: Partial<Patient>
  ): Promise<Patient> {
    this.logger.setContext({
      service: 'PatientService',
      operation: 'updatePatientProfile',
      userId: patientId
    });

    try {
      this.logger.info('Updating patient profile');
      const patient = await this.repository.updateProfile(patientId, updates);
      this.logger.info('Patient profile updated');
      return patient;
    } catch (error) {
      this.logger.error('Failed to update patient profile', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }
}

