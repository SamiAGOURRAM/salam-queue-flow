import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { ExternalServiceError } from '../shared/errors';
import { NotificationTemplateService } from './templates/NotificationTemplateService';
import {
  NotificationChannel,
  NotificationType,
} from './models/NotificationModels';
import { NotificationService } from './NotificationService';

function buildNotificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notification-1',
    clinic_id: 'clinic-1',
    patient_id: 'patient-1',
    appointment_id: 'appointment-1',
    type: 'position_update',
    channel: 'sms',
    recipient: '+212600000000',
    message_template: 'position_update',
    message_variables: null,
    rendered_message: 'Your update',
    status: 'pending',
    priority: 0,
    scheduled_for: null,
    sent_at: null,
    delivered_at: null,
    read_at: null,
    error_message: null,
    retry_count: 0,
    max_retries: 2,
    cost_estimate: null,
    created_at: '2026-01-01T10:00:00.000Z',
    ...overrides,
  };
}

function setupNotificationTableMocks() {
  const insertSingle = vi.fn();
  const insertSelect = vi.fn(() => ({ single: insertSingle }));
  const insert = vi.fn(() => ({ select: insertSelect }));

  const updateSingle = vi.fn();
  const updateSelect = vi.fn(() => ({ single: updateSingle }));
  const updateEq = vi.fn(() => ({ error: null, select: updateSelect }));
  const update = vi.fn(() => ({ eq: updateEq }));

  vi.mocked(supabase.from).mockImplementation((table: string) => {
    if (table !== 'notifications') {
      throw new Error(`Unexpected table access in test: ${table}`);
    }

    return {
      insert,
      update,
    } as any;
  });

  return {
    insertSingle,
    update,
    updateSingle,
  };
}

describe('NotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(NotificationTemplateService.prototype, 'render').mockResolvedValue('Test message');
  });

  it('retries SMS delivery and succeeds while persisting retry_count', async () => {
    const { insertSingle, update, updateSingle } = setupNotificationTableMocks();

    const baseRecord = buildNotificationRow({
      id: 'notification-retry-success',
      max_retries: 2,
      retry_count: 0,
      recipient: '+212611111111',
    });

    insertSingle.mockResolvedValue({ data: baseRecord, error: null });
    updateSingle.mockResolvedValue({
      data: {
        ...baseRecord,
        status: 'sent',
        sent_at: '2026-01-01T10:01:00.000Z',
        retry_count: 1,
      },
      error: null,
    });

    vi.mocked(supabase.functions.invoke)
      .mockResolvedValueOnce({ data: null, error: new Error('Twilio transient outage') } as any)
      .mockResolvedValueOnce({ data: { sid: 'SM123' }, error: null } as any);

    const service = new NotificationService();
    vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

    const result = await service.send({
      clinicId: 'clinic-1',
      patientId: 'patient-1',
      appointmentId: 'appointment-1',
      channel: NotificationChannel.SMS,
      type: NotificationType.POSITION_UPDATE,
      phoneNumber: '+212611111111',
      templateVariables: { position: '3' },
    });

    expect(supabase.functions.invoke).toHaveBeenCalledTimes(2);
    const updateCalls = (update as any).mock.calls as any[];

    expect(updateCalls.some((call: any[]) => {
      const payload = (call?.[0] ?? {}) as Record<string, unknown>;
      return payload.status === 'pending' && payload.retry_count === 1;
    })).toBe(true);
    expect(updateCalls.some((call: any[]) => {
      const payload = (call?.[0] ?? {}) as Record<string, unknown>;
      return payload.status === 'sent' && payload.retry_count === 1;
    })).toBe(true);
    expect(result.status).toBe('sent');
  });

  it('marks notification as failed after max retries are exhausted', async () => {
    const { insertSingle, update } = setupNotificationTableMocks();

    const baseRecord = buildNotificationRow({
      id: 'notification-retry-failed',
      max_retries: 1,
      retry_count: 0,
      recipient: '+212622222222',
    });

    insertSingle.mockResolvedValue({ data: baseRecord, error: null });
    vi.mocked(supabase.functions.invoke)
      .mockResolvedValueOnce({ data: null, error: new Error('Twilio down 1') } as any)
      .mockResolvedValueOnce({ data: null, error: new Error('Twilio down 2') } as any);

    const service = new NotificationService();
    vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

    await expect(
      service.send({
        clinicId: 'clinic-1',
        patientId: 'patient-1',
        appointmentId: 'appointment-1',
        channel: NotificationChannel.SMS,
        type: NotificationType.POSITION_UPDATE,
        phoneNumber: '+212622222222',
        templateVariables: { position: '4' },
      })
    ).rejects.toThrow(ExternalServiceError);

    expect(supabase.functions.invoke).toHaveBeenCalledTimes(2);
    const updateCalls = (update as any).mock.calls as any[];

    expect(updateCalls.some((call: any[]) => {
      const payload = (call?.[0] ?? {}) as Record<string, unknown>;
      return payload.status === 'pending' && payload.retry_count === 1;
    })).toBe(true);
    expect(updateCalls.some((call: any[]) => {
      const payload = (call?.[0] ?? {}) as Record<string, unknown>;
      return payload.status === 'failed' && payload.retry_count === 1;
    })).toBe(true);
  });

  it('applies channel rate limiting for rapid consecutive sends to same recipient', async () => {
    const { insertSingle, updateSingle } = setupNotificationTableMocks();

    const firstRecord = buildNotificationRow({
      id: 'notification-rate-1',
      recipient: '+212633333333',
      retry_count: 0,
      max_retries: 0,
    });
    const secondRecord = buildNotificationRow({
      id: 'notification-rate-2',
      recipient: '+212633333333',
      retry_count: 0,
      max_retries: 0,
    });

    insertSingle
      .mockResolvedValueOnce({ data: firstRecord, error: null })
      .mockResolvedValueOnce({ data: secondRecord, error: null });

    updateSingle
      .mockResolvedValueOnce({ data: { ...firstRecord, status: 'sent' }, error: null })
      .mockResolvedValueOnce({ data: { ...secondRecord, status: 'sent' }, error: null });

    vi.mocked(supabase.functions.invoke)
      .mockResolvedValueOnce({ data: { sid: 'SM1' }, error: null } as any)
      .mockResolvedValueOnce({ data: { sid: 'SM2' }, error: null } as any);

    const service = new NotificationService();
    const sleepSpy = vi.spyOn(service as any, 'sleep').mockResolvedValue(undefined);

    await service.send({
      clinicId: 'clinic-1',
      patientId: 'patient-1',
      appointmentId: 'appointment-1',
      channel: NotificationChannel.SMS,
      type: NotificationType.POSITION_UPDATE,
      phoneNumber: '+212633333333',
      templateVariables: { position: '2' },
    });

    await service.send({
      clinicId: 'clinic-1',
      patientId: 'patient-1',
      appointmentId: 'appointment-2',
      channel: NotificationChannel.SMS,
      type: NotificationType.POSITION_UPDATE,
      phoneNumber: '+212633333333',
      templateVariables: { position: '1' },
    });

    expect(sleepSpy.mock.calls.some(([ms]) => (ms as number) > 0)).toBe(true);
    expect(supabase.functions.invoke).toHaveBeenCalledTimes(2);
  });

  it('sends email notifications via edge function and marks them as sent', async () => {
    const { insertSingle, updateSingle } = setupNotificationTableMocks();

    const baseRecord = buildNotificationRow({
      id: 'notification-email-1',
      channel: 'email',
      recipient: 'patient@example.com',
      retry_count: 0,
      max_retries: 0,
    });

    insertSingle.mockResolvedValue({ data: baseRecord, error: null });
    updateSingle.mockResolvedValue({
      data: {
        ...baseRecord,
        status: 'sent',
        sent_at: '2026-01-01T11:00:00.000Z',
      },
      error: null,
    });

    vi.mocked(supabase.functions.invoke)
      .mockResolvedValueOnce({ data: { id: 'email-provider-id' }, error: null } as any);

    const service = new NotificationService();
    const result = await service.send({
      clinicId: 'clinic-1',
      patientId: 'patient-1',
      appointmentId: 'appointment-1',
      channel: NotificationChannel.EMAIL,
      type: NotificationType.APPOINTMENT_CONFIRMED,
      email: 'patient@example.com',
      templateVariables: { clinicName: 'Atlas Clinic' },
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'send-email',
      expect.objectContaining({
        body: expect.objectContaining({
          to: 'patient@example.com',
        }),
      })
    );
    expect(result.status).toBe('sent');
  });

  it('sends push notifications via edge function when push token is provided', async () => {
    const { insertSingle, updateSingle } = setupNotificationTableMocks();

    const baseRecord = buildNotificationRow({
      id: 'notification-push-1',
      channel: 'push',
      recipient: 'ExponentPushToken[abc123]',
      retry_count: 0,
      max_retries: 0,
    });

    insertSingle.mockResolvedValue({ data: baseRecord, error: null });
    updateSingle.mockResolvedValue({
      data: {
        ...baseRecord,
        status: 'sent',
        sent_at: '2026-01-01T11:10:00.000Z',
      },
      error: null,
    });

    vi.mocked(supabase.functions.invoke)
      .mockResolvedValueOnce({ data: { ticket: { status: 'ok' } }, error: null } as any);

    const service = new NotificationService();
    const result = await service.send({
      clinicId: 'clinic-1',
      patientId: 'patient-1',
      appointmentId: 'appointment-1',
      channel: NotificationChannel.PUSH,
      type: NotificationType.YOUR_TURN,
      templateVariables: {
        pushToken: 'ExponentPushToken[abc123]',
      },
    });

    expect(supabase.functions.invoke).toHaveBeenCalledWith(
      'send-push',
      expect.objectContaining({
        body: expect.objectContaining({
          to: 'ExponentPushToken[abc123]',
        }),
      })
    );
    expect(result.status).toBe('sent');
  });
});
