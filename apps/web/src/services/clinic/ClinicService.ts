// src/services/clinic/ClinicService.ts
//
// SINGLE SOURCE OF TRUTH: all clinic business logic lives in `@queuemed/core`
// (ClinicService + ClinicRepository), shared by the web app and the MCP/chat
// server. This file is a thin browser-side facade that wires core to the web
// Supabase client and preserves the existing web API surface.
// No clinic business logic lives here.

import type { Clinic as CoreClinic } from '@queuemed/core';
import { coreContainer } from '../core/coreContainer';
import { NotFoundError, DatabaseError } from '../shared/errors';
import { logger } from '../shared/logging/Logger';
import type { DoctorListing, DoctorSearchParams } from '@queuemed/core';

// Shared core container (one event bus + notifier for the whole app).
const coreClinic = coreContainer.clinic;

// ============================================================================
// WEB-SPECIFIC TYPES (preserved for backward compat with existing consumers)
// ============================================================================

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
  working_hours?: Record<string, { open?: string; close?: string; closed?: boolean }>;
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

// ============================================================================
// FAÇADE
// ============================================================================

export class ClinicService {
  /**
   * For testing — allows injecting a mock core service.
   */
  constructor(private readonly core: typeof coreClinic = coreClinic) {}

  async getClinic(clinicId: string): Promise<Clinic> {
    try {
      const result = await this.core.getClinic(clinicId);
      return this.toWebClinic(result);
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      if (error instanceof DatabaseError) {
        if (error.message.includes('not found')) throw new NotFoundError('Clinic not found');
        throw error;
      }
      logger.error('Unexpected error fetching clinic', error as Error, { clinicId });
      throw new DatabaseError('Unexpected error fetching clinic', error as Error);
    }
  }

  async getClinicByOwner(ownerId: string): Promise<Clinic | null> {
    try {
      const clinics = await this.core.getClinicsByOwner(ownerId);
      if (clinics.length === 0) return null;
      return this.toWebClinic(clinics[0]);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error fetching clinic by owner', error as Error, { ownerId });
      throw new DatabaseError('Unexpected error fetching clinic by owner', error as Error);
    }
  }

  async searchDoctors(params: DoctorSearchParams): Promise<DoctorListing[]> {
    try {
      logger.debug('Searching doctors', params as Record<string, unknown>);
      const doctors = await this.core.searchDoctors(params);
      logger.info('Doctors found', { count: doctors.length });
      return doctors;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error searching doctors', error as Error, params as Record<string, unknown>);
      throw new DatabaseError('Unexpected error searching doctors', error as Error);
    }
  }

  async getClinicSettings(clinicId: string): Promise<ClinicSettings> {
    try {
      const settings = await this.core.getClinicSettings(clinicId);
      return this.normalizeClinicSettings(settings as Record<string, unknown>) as ClinicSettings;
    } catch (error) {
      if (error instanceof NotFoundError) throw new NotFoundError('Clinic not found');
      if (error instanceof DatabaseError) {
        if (error.message.includes('not found')) throw new NotFoundError('Clinic not found');
        throw error;
      }
      logger.error('Unexpected error fetching clinic settings', error as Error, { clinicId });
      throw new DatabaseError('Unexpected error fetching clinic settings', error as Error);
    }
  }

  async updateClinicSettings(clinicId: string, settings: Partial<ClinicSettings>): Promise<ClinicSettings> {
    try {
      const currentSettings = await this.core.getClinicSettings(clinicId);
      const merged = {
        ...(currentSettings as Record<string, unknown>),
        ...this.normalizeClinicSettings(settings as Record<string, unknown>),
      };
      await this.core.updateClinicSettings(clinicId, merged as Record<string, unknown>);
      return merged as ClinicSettings;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error updating clinic settings', error as Error, { clinicId, settings });
      throw new DatabaseError('Unexpected error updating clinic settings', error as Error);
    }
  }

  async updateClinic(clinicId: string, data: Partial<Clinic>): Promise<Clinic> {
    try {
      const mapped: Partial<CoreClinic> = {};
      if (data.name !== undefined) mapped.name = data.name;
      if (data.nameAr !== undefined) mapped.nameAr = data.nameAr;
      if (data.specialty !== undefined) mapped.specialty = data.specialty;
      if (data.address !== undefined) mapped.address = data.address;
      if (data.city !== undefined) mapped.city = data.city;
      if (data.phone !== undefined) mapped.phoneNumber = data.phone;
      if (data.email !== undefined) mapped.email = data.email;
      if (data.logoUrl !== undefined) mapped.logoUrl = data.logoUrl;
      if (data.isActive !== undefined) mapped.isActive = data.isActive;

      const result = await this.core.updateClinic(clinicId, mapped);
      return this.toWebClinic(result);
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      logger.error('Unexpected error updating clinic', error as Error, { clinicId, data });
      throw new DatabaseError('Unexpected error updating clinic', error as Error);
    }
  }

  /**
   * Map core Clinic to web Clinic (string dates → Date, phoneNumber → phone).
   */
  private toWebClinic(core: CoreClinic): Clinic {
    return {
      id: core.id,
      name: core.name,
      nameAr: core.nameAr,
      ownerId: core.ownerId || '',
      practiceType: core.practiceType || '',
      specialty: core.specialty || '',
      address: core.address || '',
      city: core.city || '',
      phone: core.phoneNumber || '',
      email: core.email,
      logoUrl: core.logoUrl,
      settings: (core.settings || {}) as ClinicSettings,
      subscriptionTier: core.subscriptionTier || '',
      isActive: core.isActive ?? true,
      queueMode: core.queueMode ?? null,
      createdAt: new Date(core.createdAt),
      updatedAt: core.updatedAt ? new Date(core.updatedAt) : new Date(),
    };
  }

  /**
   * Normalize clinic settings (from DB or user input) to canonical snake_case.
   * Strips legacy camelCase keys that may arrive from older UI code.
   */
  private normalizeClinicSettings(raw: unknown): Record<string, unknown> {
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
      const v = settings.working_hours;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        normalized.working_hours = v;
      } else {
        delete normalized.working_hours;
      }
    }
    if ('buffer_time' in settings && typeof settings.buffer_time !== 'number') {
      delete normalized.buffer_time;
    }
    if ('allow_walk_ins' in settings && typeof settings.allow_walk_ins !== 'boolean') {
      delete normalized.allow_walk_ins;
    }
    if ('max_queue_size' in settings && typeof settings.max_queue_size !== 'number') {
      delete normalized.max_queue_size;
    }
    if ('requires_appointment' in settings && typeof settings.requires_appointment !== 'boolean') {
      delete normalized.requires_appointment;
    }
    if ('average_appointment_duration' in settings && typeof settings.average_appointment_duration !== 'number') {
      delete normalized.average_appointment_duration;
    }
    if ('appointment_types' in settings && !Array.isArray(settings.appointment_types)) {
      delete normalized.appointment_types;
    }
    if ('payment_methods' in settings) {
      const v = settings.payment_methods;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        normalized.payment_methods = v;
      } else {
        delete normalized.payment_methods;
      }
    }

    return normalized;
  }
}

// Export singleton instance
export const clinicService = new ClinicService();
