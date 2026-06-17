/**
 * Booking Repository Port
 *
 * Defines the contract for booking/appointment data access.
 * Implementations: SupabaseBookingRepository, MySQLBookingRepository, etc.
 */

import type {
  BookingRequest,
  BookingResponse,
  AvailableSlotsResponse,
  AppointmentAvailability,
  QueueMode,
  AppointmentType,
  Tables,
} from '../../types.js';

/** The clinic columns `getClinicDetails` actually selects. */
export type ClinicDetails = Pick<Tables<'clinics'>, 'id' | 'name' | 'specialty' | 'settings'>;

export interface IBookingRepository {
  /** Check if a specific time slot is available (per-staff). */
  checkAvailability(
    clinicId: string,
    staffId: string,
    date: string,
    time: string,
  ): Promise<AppointmentAvailability>;

  /** Get clinic details needed for the booking flow. */
  getClinicDetails(clinicId: string): Promise<ClinicDetails>;

  /** Get appointment types available at a clinic (settings → custom → defaults). */
  getAppointmentTypes(clinicId: string): Promise<AppointmentType[]>;

  /** Subscribe to real-time slot updates for a clinic + date. Returns unsubscribe fn. */
  subscribeToSlotUpdates(clinicId: string, date: string, callback: () => void): () => void;

  /** Get the effective queue mode for a clinic on a date. */
  getQueueModeForDate(clinicId: string, date: string): Promise<QueueMode>;

  /** Get available slots respecting the clinic's queue mode. */
  getAvailableSlotsForMode(
    clinicId: string,
    date: string,
    appointmentType?: string,
    staffId?: string,
  ): Promise<AvailableSlotsResponse>;

  /** Create an appointment using the mode-aware RPC. */
  createAppointmentForMode(booking: BookingRequest): Promise<BookingResponse>;

  /** Check availability with mode awareness (free-queue vs time-slot). */
  checkAvailabilityForMode(
    clinicId: string,
    staffId: string,
    date: string,
    time: string | null,
  ): Promise<AppointmentAvailability>;

  /** Manually assign a time slot to a free-queue appointment (staff only). */
  manuallyAssignTimeSlot(
    appointmentId: string,
    scheduledTime: string,
    assignedBy: string,
  ): Promise<unknown>;
}
