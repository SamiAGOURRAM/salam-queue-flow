/**
 * BookingNotificationHandler tests
 *
 * Verifies the app-side consumer of core's `appointment.booked` event:
 * resolves the recipient via ChannelRouter and delivers via the INotifier port,
 * gated on SMS being enabled, and never throwing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DomainEvent } from '@queuemed/core';
import { NotificationChannel, NotificationType } from '../models/NotificationModels';

// Mock the recipient resolver.
const resolveForPatient = vi.hoisted(() => vi.fn());
vi.mock('../channels/ChannelRouter', () => ({
  ChannelRouter: vi.fn(() => ({ resolveForPatient })),
}));
vi.mock('../../shared/logging/Logger');

import { handleAppointmentBooked } from './BookingNotificationHandler';
import { coreContainer } from '../../core/coreContainer';

function bookedEvent(): DomainEvent {
  return {
    eventId: 'evt-1',
    eventType: 'appointment.booked',
    timestamp: new Date(),
    clinicId: 'clinic-1',
    userId: 'patient-1',
    payload: {
      appointmentId: 'apt-1',
      patientId: 'patient-1',
      appointmentDate: '2026-06-20',
      scheduledTime: '10:30',
      appointmentType: 'consultation',
    },
  };
}

describe('handleAppointmentBooked', () => {
  let notifySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_SMS_ENABLED', 'true');
    notifySpy = vi.spyOn(coreContainer.notifier, 'notify').mockResolvedValue({ id: 'n1', status: 'sent' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    notifySpy.mockRestore();
  });

  it('resolves the recipient and delivers a confirmation via the notifier port', async () => {
    resolveForPatient.mockResolvedValue({
      channel: NotificationChannel.SMS,
      phoneNumber: '+212600000000',
      preferredLanguage: 'ar',
    });

    await handleAppointmentBooked(bookedEvent());

    expect(resolveForPatient).toHaveBeenCalledWith('patient-1');
    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(notifySpy.mock.calls[0][0]).toMatchObject({
      patientId: 'patient-1',
      appointmentId: 'apt-1',
      channel: 'sms',
      type: NotificationType.APPOINTMENT_CONFIRMED,
      phoneNumber: '+212600000000',
    });
  });

  it('skips delivery when SMS is not enabled', async () => {
    vi.stubEnv('VITE_SMS_ENABLED', 'false');
    await handleAppointmentBooked(bookedEvent());
    expect(resolveForPatient).not.toHaveBeenCalled();
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('skips delivery when the patient has no reachable channel', async () => {
    resolveForPatient.mockResolvedValue(null);
    await handleAppointmentBooked(bookedEvent());
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('never throws when delivery fails', async () => {
    resolveForPatient.mockResolvedValue({
      channel: NotificationChannel.SMS,
      phoneNumber: '+212600000000',
      preferredLanguage: 'ar',
    });
    notifySpy.mockRejectedValue(new Error('provider down'));

    await expect(handleAppointmentBooked(bookedEvent())).resolves.toBeUndefined();
  });
});
