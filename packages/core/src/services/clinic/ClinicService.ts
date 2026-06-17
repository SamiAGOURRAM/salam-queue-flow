/**
 * Clinic Service - Business logic for clinic management
 */

import type { IClinicRepository, ClinicSearchParams } from '../../ports/repositories/IClinicRepository.js';
import type { ILogger } from '../../ports/logger.js';
import type { Clinic, ClinicSettings, DoctorListing, DoctorSearchParams } from '../../types.js';
import { NotFoundError } from '../../errors.js';
import { BaseService } from '../BaseService.js';

export class ClinicService extends BaseService {
  constructor(
    private readonly repository: IClinicRepository,
    logger: ILogger
  ) {
    super(logger);
  }

  /**
   * Get clinic by ID
   */
  async getClinic(clinicId: string): Promise<Clinic> {
    return this.executeWithLogging('getClinic', {
      service: 'ClinicService',
      clinicId,
    }, async () => {
      this.logger.debug('Fetching clinic');
      const clinic = await this.repository.getById(clinicId);
      if (!clinic) {
        throw new NotFoundError('Clinic', clinicId);
      }
      this.logger.info('Clinic fetched', { name: clinic.name });
      return clinic;
    });
  }

  /**
   * Search for clinics
   */
  async searchClinics(params: ClinicSearchParams): Promise<Clinic[]> {
    return this.executeWithLogging('searchClinics', {
      service: 'ClinicService',
    }, async () => {
      this.logger.debug('Searching clinics', params as Record<string, unknown>);
      const clinics = await this.repository.search(params);
      this.logger.info('Clinics found', { count: clinics.length });
      return clinics;
    });
  }

  /**
   * Search doctors (active providers at active clinics) for patient discovery.
   */
  async searchDoctors(params: DoctorSearchParams): Promise<DoctorListing[]> {
    return this.executeWithLogging('searchDoctors', {
      service: 'ClinicService',
    }, async () => {
      this.logger.debug('Searching doctors', params as Record<string, unknown>);
      const doctors = await this.repository.searchDoctors(params);
      this.logger.info('Doctors found', { count: doctors.length });
      return doctors;
    });
  }

  /**
   * Get clinic settings
   */
  async getClinicSettings(clinicId: string): Promise<ClinicSettings | null> {
    return this.executeWithLogging('getClinicSettings', {
      service: 'ClinicService',
      clinicId,
    }, async () => {
      this.logger.debug('Fetching clinic settings');
      const settings = await this.repository.getSettings(clinicId);
      return settings;
    });
  }

  /**
   * Update clinic settings
   */
  async updateClinicSettings(
    clinicId: string,
    settings: Partial<ClinicSettings>
  ): Promise<Clinic> {
    return this.executeWithLogging('updateClinicSettings', {
      service: 'ClinicService',
      clinicId,
    }, async () => {
      this.logger.info('Updating clinic settings');
      const clinic = await this.repository.updateSettings(clinicId, settings);
      this.logger.info('Clinic settings updated');
      return clinic;
    });
  }

  /**
   * Update clinic metadata fields (name, address, specialty, etc. — NOT settings).
   */
  async updateClinic(clinicId: string, data: Partial<Clinic>): Promise<Clinic> {
    return this.executeWithLogging('updateClinic', {
      service: 'ClinicService',
      clinicId,
    }, async () => {
      this.logger.info('Updating clinic');
      const clinic = await this.repository.updateClinic(clinicId, data);
      this.logger.info('Clinic updated');
      return clinic;
    });
  }

  /**
   * Get clinics owned by a user
   */
  async getClinicsByOwner(ownerId: string): Promise<Clinic[]> {
    return this.executeWithLogging('getClinicsByOwner', {
      service: 'ClinicService',
      userId: ownerId,
    }, async () => {
      this.logger.debug('Fetching owner clinics');
      const clinics = await this.repository.getByOwnerId(ownerId);
      this.logger.info('Owner clinics fetched', { count: clinics.length });
      return clinics;
    });
  }
}

