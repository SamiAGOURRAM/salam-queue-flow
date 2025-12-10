/**
 * Booking Repository - Data access for appointments and booking
 * 
 * Adapted from src/services/booking/BookingRepository.ts
 * Now uses dependency injection instead of direct imports.
 */

import { BaseRepository } from '../base/BaseRepository';
import type { IDatabaseClient } from '../../ports/database';
import type { ILogger } from '../../ports/logger';
import type {
  BookingRequest,
  BookingResponse,
  AvailableSlotsResponse,
  AppointmentAvailability,
  QueueMode,
  AppointmentType
} from '../../types';

export class BookingRepository extends BaseRepository {
  constructor(db: IDatabaseClient, logger: ILogger) {
    super(db, logger, 'BookingRepository');
  }

  /**
   * Check if a specific time slot is available
   */
  async checkAvailability(
    clinicId: string, 
    date: string, 
    time: string
  ): Promise<AppointmentAvailability> {
    return this.executeRpc<AppointmentAvailability>(
      'check_appointment_availability',
      {
        p_clinic_id: clinicId,
        p_appointment_date: date,
        p_scheduled_time: time
      },
      'Failed to check appointment availability'
    );
  }

  /**
   * Get all available time slots for a clinic on a specific date
   */
  async getAvailableSlots(
    clinicId: string,
    date: string,
    appointmentType?: string
  ): Promise<AvailableSlotsResponse> {
    return this.executeRpc<AvailableSlotsResponse>(
      'get_available_slots',
      {
        p_clinic_id: clinicId,
        p_appointment_date: date,
        p_appointment_type: appointmentType
      },
      'Failed to fetch available time slots'
    );
  }

  /**
   * Create a new appointment with atomic validation
   */
  async createAppointment(booking: BookingRequest): Promise<BookingResponse> {
    return this.executeRpc<BookingResponse>(
      'create_appointment_with_validation',
      {
        p_clinic_id: booking.clinicId,
        p_patient_id: booking.patientId,
        p_appointment_date: booking.appointmentDate,
        p_scheduled_time: booking.scheduledTime,
        p_appointment_type: booking.appointmentType,
        p_reason: booking.reasonForVisit
      },
      'Failed to create appointment'
    );
  }

  /**
   * Get clinic details for booking
   */
  async getClinicDetails(clinicId: string) {
    const client = this.db.getClient();
    const { data, error } = await client
      .from('clinics')
      .select('id, name, specialty, settings')
      .eq('id', clinicId)
      .single();

    if (error) {
      this.logError('Failed to get clinic details', new Error(error.message), { clinicId });
      throw error;
    }
    return data;
  }

  /**
   * Get appointment types for a clinic
   */
  async getAppointmentTypes(clinicId: string): Promise<AppointmentType[]> {
    const client = this.db.getClient();
    
    try {
      // First check if the table exists and try to get custom types
      const { data: customTypes, error } = await client
        .from('clinic_appointment_types' as 'clinics') // Type workaround
        .select('name, label, duration')
        .eq('clinic_id', clinicId)
        .eq('is_active', true);

      // If we get a 404 or no data, use clinic settings or defaults
      if (error?.code === 'PGRST116' || error?.message?.includes('404') || !customTypes?.length) {
        // Try to get from clinic settings
        const { data: clinic } = await client
          .from('clinics')
          .select('settings')
          .eq('id', clinicId)
          .single();

        const settings = clinic?.settings as { appointment_types?: AppointmentType[] } | null;
        if (settings?.appointment_types) {
          return settings.appointment_types;
        }

        // Return default types
        return this.getDefaultAppointmentTypes();
      }

      return customTypes as unknown as AppointmentType[];
    } catch (error) {
      this.logDebug('Failed to fetch appointment types, using defaults', { clinicId });
      return this.getDefaultAppointmentTypes();
    }
  }

  /**
   * Get default appointment types
   */
  private getDefaultAppointmentTypes(): AppointmentType[] {
    return [
      { name: 'consultation', label: 'Consultation', duration: 15 },
      { name: 'follow_up', label: 'Follow-up', duration: 10 },
      { name: 'checkup', label: 'Checkup', duration: 15 },
      { name: 'procedure', label: 'Procedure', duration: 30 }
    ];
  }

  /**
   * Subscribe to real-time slot updates
   */
  subscribeToSlotUpdates(
    clinicId: string, 
    date: string, 
    callback: () => void
  ): () => void {
    const client = this.db.getClient();
    const channel = client
      .channel(`booking-slots-${clinicId}-${date}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `clinic_id=eq.${clinicId}`,
        },
        callback
      )
      .subscribe();

    return () => client.removeChannel(channel);
  }

  // ============================================================================
  // DUAL QUEUE MODE METHODS
  // ============================================================================

  /**
   * Get queue mode for a specific date
   */
  async getQueueModeForDate(clinicId: string, date: string): Promise<QueueMode> {
    try {
      const data = await this.executeRpc<string>(
        'get_queue_mode_for_date',
        {
          p_clinic_id: clinicId,
          p_date: date
        },
        'Failed to fetch queue mode'
      );

      // Strip extra quotes if present
      let mode = data;
      
      if (typeof data === 'string' && (data.startsWith('"') || data.startsWith("'"))) {
        try {
          mode = JSON.parse(data);
        } catch {
          mode = data.replace(/^["']|["']$/g, '');
        }
      }

      // Migrate legacy terms to clean standard
      if (mode === 'ordinal_queue') mode = 'fluid';
      if (mode === 'time_grid_fixed') mode = 'slotted';
      if (mode === 'fixed' || mode === 'hybrid') mode = 'slotted';

      this.logDebug('Queue mode processed', { original: data, cleaned: mode });

      return mode as QueueMode;
    } catch (error) {
      this.logError('Failed to fetch queue mode', error as Error);
      return null;
    }
  }

  /**
   * Get available slots respecting queue mode
   */
  async getAvailableSlotsForMode(
    clinicId: string,
    date: string,
    appointmentType?: string
  ): Promise<AvailableSlotsResponse> {
    // Check queue mode first
    const mode = await this.getQueueModeForDate(clinicId, date);
    
    // If free queue mode (fluid), return empty slots
    if (mode === 'fluid') {
      return {
        available: true,
        slots: [],
        mode: 'fluid'
      };
    }

    // For time slots mode (slotted), use the RPC function
    const data = await this.executeRpc<AvailableSlotsResponse>(
      'get_available_slots_for_mode',
      {
        p_clinic_id: clinicId,
        p_appointment_date: date,
        p_appointment_type: appointmentType || 'consultation'
      },
      'Failed to fetch available time slots'
    );

    return {
      ...data,
      mode: mode || 'slotted'
    };
  }

  /**
   * Create appointment using dual-mode function
   */
  async createAppointmentForMode(booking: BookingRequest): Promise<BookingResponse> {
    try {
      const data = await this.executeRpc<{ appointment_id: string; queue_position: number }>(
        'create_appointment_for_mode',
        {
          p_clinic_id: booking.clinicId,
          p_patient_id: booking.patientId,
          p_staff_id: null,
          p_appointment_date: booking.appointmentDate,
          p_scheduled_time: booking.scheduledTime,
          p_appointment_type: booking.appointmentType,
          p_reason_for_visit: booking.reasonForVisit || null
        },
        'Failed to create appointment'
      );

      return {
        success: true,
        appointmentId: data?.appointment_id,
        queuePosition: data?.queue_position
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      if (errorMessage?.includes('no longer available')) {
        return {
          success: false,
          error: 'This time slot is no longer available'
        };
      }
      throw error;
    }
  }

  /**
   * Check availability for mode-aware booking
   */
  async checkAvailabilityForMode(
    clinicId: string,
    date: string,
    time: string | null
  ): Promise<AppointmentAvailability> {
    // If no time (free queue), always available
    if (!time) {
      return {
        available: true,
        existingCount: 0,
        capacity: 999
      };
    }

    // For time slots, use existing availability check
    return this.checkAvailability(clinicId, date, time);
  }

  /**
   * Manually assign time slot to free queue appointment
   */
  async manuallyAssignTimeSlot(
    appointmentId: string,
    scheduledTime: string,
    assignedBy: string
  ) {
    return this.executeRpc(
      'manually_assign_time_slot',
      {
        p_appointment_id: appointmentId,
        p_scheduled_time: scheduledTime,
        p_assigned_by: assignedBy
      },
      'Failed to assign time slot'
    );
  }
}

