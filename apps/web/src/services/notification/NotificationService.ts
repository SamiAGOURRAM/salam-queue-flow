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

type NotificationInsertPayload = Database['public']['Tables']['notifications']['Insert'];
type NotificationUpdatePayload = Database['public']['Tables']['notifications']['Update'];
type NotificationRow = Database['public']['Tables']['notifications']['Row'];
type DbNotificationType = Database['public']['Enums']['notification_type'];

export class NotificationService {
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

      // Get template and render message
      const message = await this.renderTemplate(
        dto.clinicId,
        dto.type,
        dto.templateVariables || {}
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
      // Create notification record
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

      const baseRecord = notificationRecord as NotificationRow;

      // Send SMS via Edge Function
      try {
        const { data, error } = await supabase.functions.invoke('send-sms', {
          body: {
            to: dto.phoneNumber,
            message,
            notification_id: baseRecord.id,
          },
        });

        if (error) throw error;

        // Update status to sent
        const updatePayload: NotificationUpdatePayload = {
          status: NotificationStatus.SENT,
          sent_at: new Date().toISOString(),
          rendered_message: message,
          message_variables: this.toJson((data as Record<string, unknown> | null) ?? null),
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

        const persistedRecord = (updated as NotificationRow | null) ?? baseRecord;
        return this.mapToNotification(persistedRecord);

      } catch (smsError: unknown) {
        const errorMessage = smsError instanceof Error ? smsError.message : 'Unknown SMS error';
        // Update status to failed
        const failurePayload: NotificationUpdatePayload = {
          status: NotificationStatus.FAILED,
          error_message: errorMessage,
        };

        await supabase
          .from('notifications')
          .update(failurePayload)
          .eq('id', baseRecord.id);

        throw new ExternalServiceError('Twilio', 'Failed to send SMS', smsError instanceof Error ? smsError : undefined);
      }
      
    } catch (error) {
      logger.error('SMS send error', error as Error, { phoneNumber: dto.phoneNumber });
      throw error;
    }
  }

  /**
   * Send Email (placeholder for now)
   */
  private async sendEmail(dto: SendNotificationDTO, message: string): Promise<Notification> {
    logger.warn('Email sending not implemented yet', { email: dto.email });
    
    // Create notification record as pending
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

    const { data, error } = await supabase
      .from('notifications')
      .insert(insertPayload)
      .select()
      .single();

    if (error || !data) {
      throw new DatabaseError('Failed to create notification record', error);
    }

    return this.mapToNotification(data as NotificationRow);
  }

  /**
   * Send WhatsApp (placeholder for now)
   */
  private async sendWhatsApp(dto: SendNotificationDTO, message: string): Promise<Notification> {
    logger.warn('WhatsApp sending not implemented yet', { phoneNumber: dto.phoneNumber });
    
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

    const { data, error } = await supabase
      .from('notifications')
      .insert(insertPayload)
      .select()
      .single();

    if (error || !data) {
      throw new DatabaseError('Failed to create notification record', error);
    }

    return this.mapToNotification(data as NotificationRow);
  }

  /**
   * Send Push Notification (placeholder for now)
   */
  private async sendPush(dto: SendNotificationDTO, message: string): Promise<Notification> {
    logger.warn('Push notifications not implemented yet');
    
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

    const { data, error } = await supabase
      .from('notifications')
      .insert(insertPayload)
      .select()
      .single();

    if (error || !data) {
      throw new DatabaseError('Failed to create notification record', error);
    }

    return this.mapToNotification(data as NotificationRow);
  }

  /**
   * Render notification template with variables
   */
  private async renderTemplate(
    _clinicId: string,
    type: NotificationType,
    variables: Record<string, string>
  ): Promise<string> {
    const templateText = this.getDefaultTemplate(type);
    let message = templateText;

    Object.entries(variables).forEach(([key, value]) => {
      message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
    });

    return message;
  }

  private resolveRecipient(dto: SendNotificationDTO): string {
    if (dto.channel === NotificationChannel.EMAIL) {
      return dto.email ?? dto.patientId;
    }
    if (dto.channel === NotificationChannel.SMS || dto.channel === NotificationChannel.WHATSAPP) {
      return dto.phoneNumber ?? dto.patientId;
    }
    return dto.patientId;
  }

  private toJson(value: Record<string, unknown> | null): Json | null {
    return value as Json | null;
  }

  private toDbNotificationType(type: NotificationType): DbNotificationType {
    switch (type) {
      case NotificationType.PATIENT_ABSENT:
      case NotificationType.GRACE_PERIOD_ENDING:
        return NotificationType.POSITION_UPDATE;
      default:
        return type as DbNotificationType;
    }
  }

  /**
   * Default notification templates (Arabic)
   */
  private getDefaultTemplate(type: NotificationType): string {
    const templates: Record<NotificationType, string> = {
      [NotificationType.APPOINTMENT_CONFIRMED]: 'تم تأكيد موعدك في {{clinicName}}. موعدك في {{date}} في الساعة {{time}}. الموقع: {{position}}',
      [NotificationType.POSITION_UPDATE]: 'تحديث: أنت الآن في الموقع {{position}} في قائمة الانتظار',
      [NotificationType.ALMOST_YOUR_TURN]: 'تنبيه: أنت التالي! يرجى التوجه إلى {{clinicName}}',
      [NotificationType.YOUR_TURN]: 'حان دورك! يرجى التوجه إلى غرفة الاستشارة',
      [NotificationType.APPOINTMENT_DELAYED]: 'عذراً، تأخر موعدك. الوقت المتوقع الجديد: {{newTime}}',
      [NotificationType.APPOINTMENT_CANCELLED]: 'تم إلغاء موعدك في {{clinicName}}. للحجز مرة أخرى: {{bookingUrl}}',
      [NotificationType.PATIENT_ABSENT]: 'لم تكن حاضراً عند النداء. لديك {{graceMinutes}} دقيقة للعودة',
      [NotificationType.GRACE_PERIOD_ENDING]: 'تحذير: فترة السماح تنتهي خلال 5 دقائق',
    };

    return templates[type] || 'إشعار من {{clinicName}}';
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
