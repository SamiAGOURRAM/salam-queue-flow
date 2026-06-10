/**
 * Notification Service
 * Handles sending SMS, Email, Push notifications
 */

import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import { logger } from '../shared/logging/Logger';
import { DatabaseError, ExternalServiceError, ValidationError } from '../shared/errors';
import {
  Notification,
  NotificationChannel,
  NotificationType,
  NotificationStatus,
  SendNotificationDTO,
} from './models/NotificationModels';
import { NotificationTemplateService } from './templates/NotificationTemplateService';
import { WhatsAppChannel } from './channels/WhatsAppChannel';

type NotificationInsertPayload = Database['public']['Tables']['notifications']['Insert'];
type NotificationUpdatePayload = Database['public']['Tables']['notifications']['Update'];
type NotificationRow = Database['public']['Tables']['notifications']['Row'];
type DbNotificationType = Database['public']['Enums']['notification_type'];

const DELIVERY_BACKOFF_MS = [500, 1500, 3000];
const CHANNEL_RATE_LIMIT_WINDOW_MS = 750;
const rateLimitWindowByKey = new Map<string, number>();

export class NotificationService {
  private readonly templateService = new NotificationTemplateService();
  private readonly whatsAppChannel = new WhatsAppChannel();

  /**
   * Send a notification
   */
  async send(dto: SendNotificationDTO): Promise<Notification> {
    logger.info('Sending notification', { 
      type: dto.type, 
      channel: dto.channel,
      patientId: dto.patientId 
    });

    try {
      // Validate
      if (dto.channel === NotificationChannel.SMS && !dto.phoneNumber) {
        throw new ValidationError('Phone number required for SMS notifications');
      }
      if (dto.channel === NotificationChannel.EMAIL && !dto.email) {
        throw new ValidationError('Email required for email notifications');
      }
      if (dto.channel === NotificationChannel.WHATSAPP && !dto.phoneNumber) {
        throw new ValidationError('Phone number required for WhatsApp notifications');
      }
      if (dto.channel === NotificationChannel.PUSH && !this.resolvePushToken(dto)) {
        throw new ValidationError('Push token required for push notifications');
      }

      // Get template and render message
      const message = await this.renderTemplate(
        dto.clinicId,
        dto.type,
        dto.templateVariables || {},
        dto.language
      );

      // Send via appropriate channel
      let notification: Notification;
      
      switch (dto.channel) {
        case NotificationChannel.SMS:
          notification = await this.sendSMS(dto, message);
          break;
        case NotificationChannel.EMAIL:
          notification = await this.sendEmail(dto, message);
          break;
        case NotificationChannel.WHATSAPP:
          notification = await this.sendWhatsApp(dto, message);
          break;
        case NotificationChannel.PUSH:
          notification = await this.sendPush(dto, message);
          break;
        default:
          throw new ValidationError(`Unsupported notification channel: ${dto.channel}`);
      }

      logger.info('Notification sent successfully', { notificationId: notification.id });
      return notification;
      
    } catch (error) {
      logger.error('Failed to send notification', error as Error, { dto });
      throw error;
    }
  }

  /**
   * Send SMS via Twilio Edge Function
   */
  private async sendSMS(dto: SendNotificationDTO, message: string): Promise<Notification> {
    try {
      const baseRecord = await this.createNotificationRecord(dto, message);

      return await this.deliverWithRetry(
        dto,
        message,
        baseRecord,
        'Twilio',
        async () => {
          const { data, error } = await supabase.functions.invoke('send-sms', {
            body: {
              to: dto.phoneNumber,
              message,
              notification_id: baseRecord.id,
            },
          });

          if (error) throw error;
          return (data as Record<string, unknown> | null) ?? null;
        }
      );
      
    } catch (error) {
      logger.error('SMS send error', error as Error, { phoneNumber: dto.phoneNumber });
      throw error;
    }
  }

  /**
   * Send Email via Edge Function provider bridge
   */
  private async sendEmail(dto: SendNotificationDTO, message: string): Promise<Notification> {
    try {
      const baseRecord = await this.createNotificationRecord(dto, message);
      const subject = this.resolveEmailSubject(dto.type, dto.templateVariables);

      return await this.deliverWithRetry(
        dto,
        message,
        baseRecord,
        'Email provider',
        async () => {
          const { data, error } = await supabase.functions.invoke('send-email', {
            body: {
              to: dto.email,
              subject,
              message,
              notification_id: baseRecord.id,
            },
          });

          if (error) throw error;
          return (data as Record<string, unknown> | null) ?? null;
        }
      );
    } catch (error) {
      logger.error('Email send error', error as Error, { email: dto.email });
      throw error;
    }
  }

  /**
   * Send WhatsApp via Twilio channel bridge
   */
  private async sendWhatsApp(dto: SendNotificationDTO, message: string): Promise<Notification> {
    try {
      const baseRecord = await this.createNotificationRecord(dto, message);

      return await this.deliverWithRetry(
        dto,
        message,
        baseRecord,
        'Twilio WhatsApp',
        async () => {
          const delivery = await this.whatsAppChannel.send({
            to: dto.phoneNumber as string,
            message,
            notificationId: baseRecord.id,
          });

          return delivery.raw;
        }
      );
    } catch (error) {
      logger.error('WhatsApp send error', error as Error, { phoneNumber: dto.phoneNumber });
      throw error;
    }
  }

  /**
   * Send push notification via Edge Function provider bridge
   */
  private async sendPush(dto: SendNotificationDTO, message: string): Promise<Notification> {
    const pushToken = this.resolvePushToken(dto);
    if (!pushToken) {
      throw new ValidationError('Push token required for push notifications');
    }

    try {
      const baseRecord = await this.createNotificationRecord(dto, message);
      const title = this.resolvePushTitle(dto.type);

      return await this.deliverWithRetry(
        dto,
        message,
        baseRecord,
        'Push provider',
        async () => {
          const { data, error } = await supabase.functions.invoke('send-push', {
            body: {
              to: pushToken,
              title,
              body: message,
              notification_id: baseRecord.id,
              patient_id: dto.patientId,
            },
          });

          if (error) throw error;
          return (data as Record<string, unknown> | null) ?? null;
        }
      );
    } catch (error) {
      logger.error('Push send error', error as Error, { patientId: dto.patientId });
      throw error;
    }
  }

  private async createNotificationRecord(dto: SendNotificationDTO, message: string): Promise<NotificationRow> {
    const recipient = this.resolveRecipient(dto);
    const insertPayload: NotificationInsertPayload = {
      clinic_id: dto.clinicId,
      patient_id: dto.patientId,
      appointment_id: dto.appointmentId ?? null,
      channel: dto.channel,
      type: this.toDbNotificationType(dto.type),
      recipient,
      message_template: dto.type,
      rendered_message: message,
      message_variables: this.toJson(dto.templateVariables ?? null),
      status: NotificationStatus.PENDING,
    };

    const { data: notificationRecord, error: insertError } = await supabase
      .from('notifications')
      .insert(insertPayload)
      .select()
      .single();

    if (insertError || !notificationRecord) {
      throw new DatabaseError('Failed to create notification record', insertError);
    }

    return notificationRecord as NotificationRow;
  }

  private async deliverWithRetry(
    dto: SendNotificationDTO,
    message: string,
    baseRecord: NotificationRow,
    providerName: string,
    sendAttempt: () => Promise<Record<string, unknown> | null>
  ): Promise<Notification> {
    const maxRetries = Math.max(0, baseRecord.max_retries ?? 0);
    let retryCount = Math.max(0, baseRecord.retry_count ?? 0);
    const recipient = this.resolveRecipient(dto);

    while (true) {
      try {
        await this.enforceRateLimit(dto.channel, recipient);

        const providerMetadata = await sendAttempt();

        const updatePayload: NotificationUpdatePayload = {
          status: NotificationStatus.SENT,
          sent_at: new Date().toISOString(),
          rendered_message: message,
          retry_count: retryCount,
          error_message: null,
          message_variables: this.toJson({
            ...(dto.templateVariables ?? {}),
            provider: providerMetadata,
          }),
        };

        const { data: updated, error: updateError } = await supabase
          .from('notifications')
          .update(updatePayload)
          .eq('id', baseRecord.id)
          .select()
          .single();

        if (updateError) {
          logger.warn('Failed to update notification status', { error: updateError });
        }

        const persistedRecord = (updated as NotificationRow | null) ?? {
          ...baseRecord,
          status: NotificationStatus.SENT,
          sent_at: updatePayload.sent_at,
          rendered_message: message,
          retry_count: retryCount,
          error_message: null,
          message_variables: updatePayload.message_variables ?? null,
        };

        return this.mapToNotification(persistedRecord);
      } catch (sendError: unknown) {
        const errorMessage = sendError instanceof Error ? sendError.message : 'Unknown delivery error';

        if (retryCount < maxRetries) {
          retryCount += 1;
          const retryPayload: NotificationUpdatePayload = {
            status: NotificationStatus.PENDING,
            retry_count: retryCount,
            error_message: errorMessage,
          };

          await supabase
            .from('notifications')
            .update(retryPayload)
            .eq('id', baseRecord.id);

          const delayMs = this.getRetryDelayMs(retryCount);
          logger.warn('Notification delivery attempt failed, retrying', {
            notificationId: baseRecord.id,
            providerName,
            channel: dto.channel,
            retryCount,
            maxRetries,
            delayMs,
          });

          if (delayMs > 0) {
            await this.sleep(delayMs);
          }

          continue;
        }

        const failurePayload: NotificationUpdatePayload = {
          status: NotificationStatus.FAILED,
          retry_count: retryCount,
          error_message: errorMessage,
        };

        await supabase
          .from('notifications')
          .update(failurePayload)
          .eq('id', baseRecord.id);

        throw new ExternalServiceError(
          providerName,
          `Failed to send ${dto.channel} notification after ${retryCount + 1} attempts`,
          sendError instanceof Error ? sendError : undefined
        );
      }
    }
  }

  private async enforceRateLimit(channel: NotificationChannel, recipient: string): Promise<void> {
    if (channel !== NotificationChannel.SMS && channel !== NotificationChannel.WHATSAPP) {
      return;
    }

    const now = Date.now();
    const globalKey = `${channel}:global`;
    const recipientKey = `${channel}:${recipient}`;

    const waitUntil = Math.max(
      rateLimitWindowByKey.get(globalKey) ?? 0,
      rateLimitWindowByKey.get(recipientKey) ?? 0
    );

    if (waitUntil > now) {
      await this.sleep(waitUntil - now);
    }

    const nextAllowedAt = Date.now() + CHANNEL_RATE_LIMIT_WINDOW_MS;
    rateLimitWindowByKey.set(globalKey, nextAllowedAt);
    rateLimitWindowByKey.set(recipientKey, nextAllowedAt);

    // Keep map bounded in long-lived sessions.
    if (rateLimitWindowByKey.size > 2000) {
      const cutoff = Date.now() - CHANNEL_RATE_LIMIT_WINDOW_MS;
      for (const [key, value] of rateLimitWindowByKey.entries()) {
        if (value < cutoff) {
          rateLimitWindowByKey.delete(key);
        }
      }
    }
  }

  private getRetryDelayMs(retryCount: number): number {
    const arrayIndex = Math.max(0, retryCount - 1);
    if (arrayIndex < DELIVERY_BACKOFF_MS.length) {
      return DELIVERY_BACKOFF_MS[arrayIndex];
    }

    const last = DELIVERY_BACKOFF_MS[DELIVERY_BACKOFF_MS.length - 1] ?? 3000;
    const overflowFactor = Math.pow(2, arrayIndex - DELIVERY_BACKOFF_MS.length + 1);
    return Math.min(last * overflowFactor, 15_000);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Render notification template with variables
   */
  private async renderTemplate(
    clinicId: string,
    type: NotificationType,
    variables: Record<string, string>,
    language?: string
  ): Promise<string> {
    return this.templateService.render(clinicId, type, variables, language);
  }

  private resolveEmailSubject(
    type: NotificationType,
    templateVariables?: Record<string, string>
  ): string {
    const clinicName = templateVariables?.clinicName || templateVariables?.clinic_name;

    const baseSubjectByType: Record<NotificationType, string> = {
      [NotificationType.APPOINTMENT_CONFIRMED]: 'Appointment confirmed',
      [NotificationType.POSITION_UPDATE]: 'Queue position update',
      [NotificationType.ALMOST_YOUR_TURN]: 'You are almost up',
      [NotificationType.YOUR_TURN]: 'It is your turn',
      [NotificationType.APPOINTMENT_DELAYED]: 'Appointment delay update',
      [NotificationType.APPOINTMENT_CANCELLED]: 'Appointment cancelled',
      [NotificationType.PATIENT_ABSENT]: 'Patient absent notice',
      [NotificationType.GRACE_PERIOD_ENDING]: 'Grace period ending soon',
    };

    const baseSubject = baseSubjectByType[type] ?? 'Queue update';
    return clinicName ? `${baseSubject} - ${clinicName}` : baseSubject;
  }

  private resolvePushTitle(type: NotificationType): string {
    const titles: Record<NotificationType, string> = {
      [NotificationType.APPOINTMENT_CONFIRMED]: 'Appointment confirmed',
      [NotificationType.POSITION_UPDATE]: 'Queue update',
      [NotificationType.ALMOST_YOUR_TURN]: 'Almost your turn',
      [NotificationType.YOUR_TURN]: 'Your turn',
      [NotificationType.APPOINTMENT_DELAYED]: 'Appointment delayed',
      [NotificationType.APPOINTMENT_CANCELLED]: 'Appointment cancelled',
      [NotificationType.PATIENT_ABSENT]: 'Patient absent',
      [NotificationType.GRACE_PERIOD_ENDING]: 'Grace period ending',
    };

    return titles[type] ?? 'Queue notification';
  }

  private resolvePushToken(dto: SendNotificationDTO): string | null {
    if (dto.channel !== NotificationChannel.PUSH) {
      return null;
    }

    // Prefer the dedicated pushToken field
    if (dto.pushToken?.trim()) {
      return dto.pushToken.trim();
    }

    // Fallback to templateVariables for backwards compatibility
    const variables = dto.templateVariables ?? {};
    const pushToken = variables.pushToken
      ?? variables.push_token
      ?? variables.deviceToken
      ?? variables.device_token;

    if (!pushToken) {
      return null;
    }

    const normalizedToken = pushToken.trim();
    return normalizedToken.length > 0 ? normalizedToken : null;
  }

  private resolveRecipient(dto: SendNotificationDTO): string {
    if (dto.channel === NotificationChannel.EMAIL) {
      return dto.email ?? dto.patientId;
    }
    if (dto.channel === NotificationChannel.SMS || dto.channel === NotificationChannel.WHATSAPP) {
      return dto.phoneNumber ?? dto.patientId;
    }
    if (dto.channel === NotificationChannel.PUSH) {
      return this.resolvePushToken(dto) ?? dto.patientId;
    }
    return dto.patientId;
  }

  private toJson(value: Record<string, unknown> | null): Json | null {
    return value as Json | null;
  }

  private toDbNotificationType(type: NotificationType): DbNotificationType {
    return type as DbNotificationType;
  }

  /**
   * Map database row to Notification model
   */
  private mapToNotification(data: NotificationRow): Notification {
    const createdAt = data.created_at ? new Date(data.created_at) : new Date();
    const updatedAt = new Date(data.delivered_at ?? data.sent_at ?? data.created_at ?? new Date().toISOString());
    const isPhoneChannel = data.channel === NotificationChannel.SMS || data.channel === NotificationChannel.WHATSAPP;
    const isEmailChannel = data.channel === NotificationChannel.EMAIL;
    const metadata = data.message_variables;

    return {
      id: data.id,
      clinicId: data.clinic_id,
      patientId: data.patient_id,
      appointmentId: data.appointment_id ?? undefined,
      channel: data.channel as NotificationChannel,
      type: data.type as NotificationType,
      phoneNumber: isPhoneChannel ? data.recipient : undefined,
      email: isEmailChannel ? data.recipient : undefined,
      message: data.rendered_message ?? data.message_template,
      status: (data.status as NotificationStatus) ?? NotificationStatus.PENDING,
      sentAt: data.sent_at ? new Date(data.sent_at) : undefined,
      deliveredAt: data.delivered_at ? new Date(data.delivered_at) : undefined,
      failureReason: data.error_message ?? undefined,
      metadata:
        metadata && typeof metadata === 'object' && !Array.isArray(metadata)
          ? (metadata as Record<string, unknown>)
          : undefined,
      createdAt,
      updatedAt,
    };
  }
}
