// src/services/booking/BookingService.ts
//
// SINGLE SOURCE OF TRUTH: all booking logic lives in `@queuemed/core`
// (BookingService + BookingRepository), shared by the web app and the MCP/chat
// server. This file is a thin browser-side facade that wires core to the web
// Supabase client and preserves the existing web API surface, so consumers and
// `./types` are unchanged. No booking logic lives here.
import { coreContainer } from '../core/coreContainer';
import { BookingRequest, BookingResponse, AvailableSlotsResponse } from './types';

// Shared core container (one event bus + notifier for the whole app), so a
// successful booking's `appointment.booked` event reaches the confirmation
// handler subscribed to the same bus.
const core = coreContainer.booking;

/**
 * Thin facade over the core BookingService. Core returns structurally-identical
 * shapes; the only nominal gap is `QueueMode` (a string-union in core vs the web
 * enum), so slot results are cast at this boundary — runtime values are identical.
 */
export class BookingService {
  bookAppointmentForMode(request: BookingRequest): Promise<BookingResponse> {
    return core.bookAppointmentForMode(request);
  }

  getAvailableSlotsForMode(
    clinicId: string,
    date: string,
    appointmentType: string,
    staffId: string
  ): Promise<AvailableSlotsResponse> {
    return core.getAvailableSlotsForMode(clinicId, date, appointmentType, staffId) as Promise<AvailableSlotsResponse>;
  }

  getClinicInfo(clinicId: string) {
    return core.getClinicInfo(clinicId);
  }

  getQueueMode(clinicId: string, date: string) {
    return core.getQueueMode(clinicId, date);
  }

  manuallyAssignTimeSlot(appointmentId: string, scheduledTime: string, assignedBy: string) {
    return core.manuallyAssignTimeSlot(appointmentId, scheduledTime, assignedBy);
  }

  subscribeToSlotUpdates(clinicId: string, date: string, callback: () => void): () => void {
    return core.subscribeToSlotUpdates(clinicId, date, callback);
  }
}

// Export singleton instance
export const bookingService = new BookingService();
