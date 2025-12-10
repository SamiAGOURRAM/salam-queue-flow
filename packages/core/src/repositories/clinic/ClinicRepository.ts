/**
 * Clinic Repository - Data access for clinic management
 */

import { BaseRepository } from '../base/BaseRepository';
import type { IDatabaseClient } from '../../ports/database';
import type { ILogger } from '../../ports/logger';
import type { Clinic, ClinicSettings } from '../../types';
import { NotFoundError } from '../../errors';

export interface ClinicSearchParams {
  city?: string;
  specialty?: string;
  name?: string;
  limit?: number;
  offset?: number;
}

export class ClinicRepository extends BaseRepository {
  constructor(db: IDatabaseClient, logger: ILogger) {
    super(db, logger, 'ClinicRepository');
  }

  /**
   * Get clinic by ID
   */
  async getById(clinicId: string): Promise<Clinic | null> {
    const client = this.db.getClient();
    const { data, error } = await client
      .from('clinics')
      .select('*')
      .eq('id', clinicId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      this.logError('Failed to get clinic', new Error(error.message), { clinicId });
      throw new Error(error.message || 'Failed to get clinic');
    }

    return this.mapToClinic(data);
  }

  /**
   * Search clinics
   */
  async search(params: ClinicSearchParams): Promise<Clinic[]> {
    const client = this.db.getClient();
    let query = client
      .from('clinics')
      .select('*');

    if (params.city) {
      query = query.ilike('city', `%${params.city}%`);
    }

    if (params.specialty) {
      query = query.ilike('specialty', `%${params.specialty}%`);
    }

    if (params.name) {
      query = query.ilike('name', `%${params.name}%`);
    }

    if (params.limit) {
      query = query.limit(params.limit);
    }

    if (params.offset) {
      query = query.range(params.offset, params.offset + (params.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      this.logError('Failed to search clinics', new Error(error.message), params as Record<string, unknown>);
      throw new Error(error.message || 'Failed to search clinics');
    }

    return (data || []).map(row => this.mapToClinic(row));
  }

  /**
   * Get clinic settings
   */
  async getSettings(clinicId: string): Promise<ClinicSettings | null> {
    const clinic = await this.getById(clinicId);
    return clinic?.settings || null;
  }

  /**
   * Update clinic settings
   */
  async updateSettings(clinicId: string, settings: Partial<ClinicSettings>): Promise<Clinic> {
    const client = this.db.getClient();
    
    // First get current settings
    const current = await this.getById(clinicId);
    if (!current) {
      throw new NotFoundError('Clinic', clinicId);
    }

    const updatedSettings = {
      ...current.settings,
      ...settings
    };

    const { data, error } = await client
      .from('clinics')
      .update({ settings: updatedSettings })
      .eq('id', clinicId)
      .select()
      .single();

    if (error) {
      this.logError('Failed to update clinic settings', new Error(error.message), { clinicId });
      throw error;
    }

    return this.mapToClinic(data);
  }

  /**
   * Get clinics by owner ID
   */
  async getByOwnerId(ownerId: string): Promise<Clinic[]> {
    const client = this.db.getClient();
    const { data, error } = await client
      .from('clinics')
      .select('*')
      .eq('owner_id', ownerId);

    if (error) {
      this.logError('Failed to get clinics by owner', new Error(error.message), { ownerId });
      throw error;
    }

    return (data || []).map(row => this.mapToClinic(row));
  }

  /**
   * Map database row to Clinic
   */
  private mapToClinic(row: Record<string, unknown>): Clinic {
    return {
      id: row.id as string,
      name: row.name as string,
      specialty: row.specialty as string | undefined,
      address: row.address as string | undefined,
      city: row.city as string | undefined,
      phoneNumber: row.phone_number as string | undefined,
      email: row.email as string | undefined,
      settings: row.settings as ClinicSettings | undefined,
      createdAt: row.created_at as string
    };
  }
}

