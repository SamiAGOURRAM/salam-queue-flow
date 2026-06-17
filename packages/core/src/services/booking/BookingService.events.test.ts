/**
 * BookingService — appointment.booked event emission
 *
 * The booking SSOT announces a successful booking so notification handlers
 * (web today, MCP later) can deliver a confirmation via INotifier. Verifies the
 * event fires on success, not on failure, and never breaks the booking.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BookingService, APPOINTMENT_BOOKED_EVENT } from './BookingService.js';
import { ConsoleLogger } from '../../ports/logger.js';
import type { IEventBus } from '../../ports/eventBus.js';
import type { IBookingRepository } from '../../ports/repositories/IBookingRepository.js';
import type { BookingRequest } from '../../types.js';

const request: BookingRequest = {
  clinicId: 'clinic-1',
  staffId: 'staff-1',
  patientId: 'patient-1',
  appointmentDate: '2026-06-20',
  scheduledTime: '10:30',
  appointmentType: 'consultation',
};

function makeEventBus() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(),
    generateEventId: vi.fn().mockReturnValue('evt-1'),
  } satisfies IEventBus;
}

function makeRepo(createResult: { success: boolean; appointmentId?: string; queuePosition?: number; error?: string }) {
  return {
    checkAvailabilityForMode: vi.fn().mockResolvedValue({ available: true }),
    createAppointmentForMode: vi.fn().mockResolvedValue(createResult),
  } as unknown as IBookingRepository;
}

describe('BookingService appointment.booked event', () => {
  const logger = new ConsoleLogger();
  beforeEach(() => vi.clearAllMocks());

  it('publishes appointment.booked on a successful booking', async () => {
    const eventBus = makeEventBus();
    const repo = makeRepo({ success: true, appointmentId: 'apt-9', queuePosition: 3 });
    const service = new BookingService(repo, eventBus, logger);

    const result = await service.bookAppointmentForMode(request);

    expect(result.success).toBe(true);
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    const event = eventBus.publish.mock.calls[0][0];
    expect(event.eventType).toBe(APPOINTMENT_BOOKED_EVENT);
    expect(event.payload).toMatchObject({ appointmentId: 'apt-9', patientId: 'patient-1', queuePosition: 3 });
  });

  it('does not publish when the booking fails', async () => {
    const eventBus = makeEventBus();
    const repo = makeRepo({ success: false, error: 'slot taken' });
    const service = new BookingService(repo, eventBus, logger);

    const result = await service.bookAppointmentForMode(request);

    expect(result.success).toBe(false);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('still returns the booking when event publishing throws (best-effort)', async () => {
    const eventBus = makeEventBus();
    eventBus.publish.mockRejectedValue(new Error('bus down'));
    const repo = makeRepo({ success: true, appointmentId: 'apt-9', queuePosition: 1 });
    const service = new BookingService(repo, eventBus, logger);

    const result = await service.bookAppointmentForMode(request);

    expect(result.success).toBe(true);
    expect(result.appointmentId).toBe('apt-9');
  });
});
