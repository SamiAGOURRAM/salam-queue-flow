/**
 * Clinic Service - Business logic for clinic management
 */

import type { ClinicRepository, ClinicSearchParams } from '../../repositories/clinic/ClinicRepository';
import type { ILogger } from '../../ports/logger';
import type { Clinic, ClinicSettings } from '../../types';
import { NotFoundError } from '../../errors';

export class ClinicService {
  constructor(
    private readonly repository: ClinicRepository,
    private readonly logger: ILogger
  ) {}

  /**
   * Get clinic by ID
   */
  async getClinic(clinicId: string): Promise<Clinic> {
    this.logger.setContext({
      service: 'ClinicService',
      operation: 'getClinic',
      clinicId
    });

    try {
      this.logger.debug('Fetching clinic');
      const clinic = await this.repository.getById(clinicId);

      if (!clinic) {
        throw new NotFoundError('Clinic', clinicId);
      }

      this.logger.info('Clinic fetched', { name: clinic.name });
      return clinic;
    } catch (error) {
      this.logger.error('Failed to get clinic', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Search for clinics
   */
  async searchClinics(params: ClinicSearchParams): Promise<Clinic[]> {
    this.logger.setContext({
      service: 'ClinicService',
      operation: 'searchClinics'
    });

    try {
      this.logger.debug('Searching clinics', params as Record<string, unknown>);
      const clinics = await this.repository.search(params);
      this.logger.info('Clinics found', { count: clinics.length });
      return clinics;
    } catch (error) {
      this.logger.error('Failed to search clinics', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Get clinic settings
   */
  async getClinicSettings(clinicId: string): Promise<ClinicSettings | null> {
    this.logger.setContext({
      service: 'ClinicService',
      operation: 'getClinicSettings',
      clinicId
    });

    try {
      this.logger.debug('Fetching clinic settings');
      const settings = await this.repository.getSettings(clinicId);
      return settings;
    } catch (error) {
      this.logger.error('Failed to get clinic settings', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Update clinic settings
   */
  async updateClinicSettings(
    clinicId: string,
    settings: Partial<ClinicSettings>
  ): Promise<Clinic> {
    this.logger.setContext({
      service: 'ClinicService',
      operation: 'updateClinicSettings',
      clinicId
    });

    try {
      this.logger.info('Updating clinic settings');
      const clinic = await this.repository.updateSettings(clinicId, settings);
      this.logger.info('Clinic settings updated');
      return clinic;
    } catch (error) {
      this.logger.error('Failed to update clinic settings', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Get clinics owned by a user
   */
  async getClinicsByOwner(ownerId: string): Promise<Clinic[]> {
    this.logger.setContext({
      service: 'ClinicService',
      operation: 'getClinicsByOwner',
      userId: ownerId
    });

    try {
      this.logger.debug('Fetching owner clinics');
      const clinics = await this.repository.getByOwnerId(ownerId);
      this.logger.info('Owner clinics fetched', { count: clinics.length });
      return clinics;
    } catch (error) {
      this.logger.error('Failed to get owner clinics', error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }
}

