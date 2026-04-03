import { supabase } from '@/integrations/supabase/client';
import {
  BookingRequest,
  BookingResponse,
  AvailableSlotsResponse,
  AppointmentAvailability
} from './types';
import { QueueMode } from '../queue/models/QueueModels';

export class BookingRepository {
  /**
   * Check if a specific time slot is available
   */
  async checkAvailability(
    clinicId: string,
    staffId: string,
    date: string,
    time: string
  ): Promise<AppointmentAvailability> {
    const { data, error } = await supabase.rpc('check_appointment_availability', {
      p_clinic_id: clinicId,
      p_staff_id: staffId,
      p_appointment_date: date,
      p_scheduled_time: time
    });

    if (error) {
      console.error('Error checking availability:', error);
      throw new Error('Failed to check appointment availability');
    }

    return data as unknown as AppointmentAvailability;
  }

  /**
   * Get all available time slots for a clinic on a specific date
   */
  async getAvailableSlots(
    clinicId: string,
    staffId: string,
    date: string,
    appointmentType?: string
  ): Promise<AvailableSlotsResponse> {
    const { data, error } = await supabase.rpc('get_available_slots', {
      p_clinic_id: clinicId,
      p_staff_id: staffId,
      p_appointment_date: date,
      p_appointment_type: appointmentType
    });

    if (error) {
      console.error('Error fetching available slots:', error);
      throw new Error('Failed to fetch available time slots');
    }

    return data as unknown as AvailableSlotsResponse;
  }

  /**
   * Create a new appointment with atomic validation
   */
  async createAppointment(booking: BookingRequest): Promise<BookingResponse> {
    const { data, error } = await supabase.rpc('create_appointment_with_validation', {
      p_clinic_id: booking.clinicId,
      p_patient_id: booking.patientId,
      p_staff_id: booking.staffId,
      p_appointment_date: booking.appointmentDate,
      p_scheduled_time: booking.scheduledTime,
      p_appointment_type: booking.appointmentType,
      p_reason: booking.reasonForVisit
    });

    if (error) {
      console.error('Error creating appointment:', error);
      throw error;
    }

    return data as unknown as BookingResponse;
  }

  /**
   * Get clinic details for booking
   */
  async getClinicDetails(clinicId: string) {
    const { data, error } = await supabase
      .from('clinics')
      .select('id, name, specialty, settings')
      .eq('id', clinicId)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get appointment types for a clinic
   */
  async getAppointmentTypes(clinicId: string) {
    const { data: clinic, error } = await supabase
      .from('clinics')
      .select('settings')
      .eq('id', clinicId)
      .single();

    if (error) {
      throw error;
    }

    const settings = clinic?.settings;
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
      const appointmentTypes = (settings as Record<string, unknown>).appointment_types;
      if (Array.isArray(appointmentTypes)) {
        return appointmentTypes;
      }
    }

    return [];
  }

  /**
   * Subscribe to real-time slot updates
   */
  subscribeToSlotUpdates(
    clinicId: string, 
    date: string, 
    callback: () => void
  ) {
    const channel = supabase
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

    return () => supabase.removeChannel(channel);
  }

  // ============================================================================
  // MODE-AWARE BOOKING METHODS
  // ============================================================================

  /**
   * Get queue mode for a specific date
   */
  async getQueueModeForDate(clinicId: string, date: string): Promise<QueueMode> {
    const { data, error } = await supabase.rpc('get_queue_mode_for_date', {
      p_clinic_id: clinicId,
      p_date: date
    });
  
    if (error) {
      console.error('Error fetching queue mode:', error);
      throw new Error('Failed to fetch queue mode');
    }

    if (data !== QueueMode.FLUID && data !== QueueMode.SLOTTED) {
      throw new Error(`Unsupported queue mode: ${String(data)}`);
    }

    return data;
  }

  /**
   * Get available slots respecting queue mode
   */
  async getAvailableSlotsForMode(
    clinicId: string,
    date: string,
    appointmentType: string,
    staffId: string
  ): Promise<AvailableSlotsResponse> {
    const mode = await this.getQueueModeForDate(clinicId, date);
    
    if (mode === QueueMode.FLUID) {
      return {
        available: true,
        slots: [],
        mode: QueueMode.FLUID
      };
    }

    const { data, error } = await supabase.rpc('get_available_slots_for_mode', {
      p_clinic_id: clinicId,
      p_staff_id: staffId,
      p_appointment_date: date,
      p_appointment_type: appointmentType
    });

    if (error) {
      console.error('Error fetching available slots:', error);
      throw new Error('Failed to fetch available time slots');
    }

    const responsePayload =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};

    return {
      ...responsePayload,
      mode
    } as AvailableSlotsResponse;
  }

  /**
   * NEW: Create appointment using dual-mode function
   */
  async createAppointmentForMode(booking: BookingRequest): Promise<BookingResponse> {
    const { data, error } = await supabase.rpc('create_appointment_for_mode', {
      p_clinic_id: booking.clinicId,
      p_patient_id: booking.patientId,
      p_staff_id: booking.staffId,
      p_appointment_date: booking.appointmentDate,
      p_scheduled_time: booking.scheduledTime, // Can be null for free queue
      p_appointment_type: booking.appointmentType,
      p_reason_for_visit: booking.reasonForVisit || null
    });

    if (error) {
      console.error('Error creating appointment:', error);

      const errorText = [error.message, error.details, error.hint]
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
        .join(' ')
        .toLowerCase();

      if (errorText.includes('no longer available')) {
        return {
          success: false,
          error: 'This time slot is no longer available'
        };
      }

      if (errorText.includes('scheduled_time') && errorText.includes('hh:mm')) {
        return {
          success: false,
          error: 'Invalid time slot format. Please refresh and try again.'
        };
      }
      
      throw error;
    }

    const responsePayload =
      data && typeof data === 'object' && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};

    return {
      success: true,
      appointmentId: responsePayload.appointment_id as string | undefined,
      queuePosition: responsePayload.queue_position as number | undefined
    };
  }

  /**
   * NEW: Check availability for mode-aware booking
   * For free queue, always returns available
   * For time slots, checks actual availability
   */
  async checkAvailabilityForMode(
    clinicId: string,
    staffId: string,
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
    return this.checkAvailability(clinicId, staffId, date, time);
  }

  /**
   * NEW: Manually assign time slot to free queue appointment (for staff)
   */
  async manuallyAssignTimeSlot(
    appointmentId: string,
    scheduledTime: string,
    assignedBy: string
  ) {
    const { data, error } = await supabase.rpc('manually_assign_time_slot', {
      p_appointment_id: appointmentId,
      p_scheduled_time: scheduledTime,
      p_assigned_by: assignedBy
    });

    if (error) {
      console.error('Error assigning time slot:', error);
      throw error;
    }

    return data;
  }
}