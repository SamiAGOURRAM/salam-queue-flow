/**
 * Notification Service
 * Handles sending SMS, Email, Push notifications
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '../shared/logging/Logger';
import { DatabaseError, ExternalServiceError, ValidationError } from '../shared/errors';
import {
  Notification,
  NotificationChannel,
  NotificationType,
  NotificationStatus,
  SendNotificationDTO,
} from './models/NotificationModels';

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
      const { data: notificationRecord, error: insertError } = await supabase
        .from('notifications')
        .insert({
          clinic_id: dto.clinicId,
          patient_id: dto.patientId,
          appointment_id: dto.appointmentId,
          channel: dto.channel as any,
          type: dto.type as any,
          phone_number: dto.phoneNumber,
          message,
          status: NotificationStatus.PENDING as any,
        } as any)
        .select()
        .single();

      if (insertError) throw new DatabaseError('Failed to create notification record', insertError);

      // Send SMS via Edge Function
      try {
        const { data, error } = await supabase.functions.invoke('send-sms', {
          body: {
            to: dto.phoneNumber,
            message,
            notification_id: notificationRecord.id,
          },
        });

        if (error) throw error;

        // Update status to sent
        const { data: updated, error: updateError } = await supabase
          .from('notifications')
          .update({
            status: NotificationStatus.SENT,
            sent_at: new Date().toISOString(),
            metadata: data,
          })
          .eq('id', notificationRecord.id)
          .select()
          .single();

        if (updateError) {
          logger.warn('Failed to update notification status', { error: updateError });
        }

        return this.mapToNotification(updated || notificationRecord);

      } catch (smsError: any) {
        // Update status to failed
        await supabase
          .from('notifications')
          .update({
            status: NotificationStatus.FAILED,
            failure_reason: smsError.message,
          })
          .eq('id', notificationRecord.id);

        throw new ExternalServiceError('Twilio', 'Failed to send SMS', smsError);
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
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        clinic_id: dto.clinicId,
        patient_id: dto.patientId,
        appointment_id: dto.appointmentId,
        channel: dto.channel as any,
        type: dto.type as any,
        email: dto.email,
        message,
        status: NotificationStatus.PENDING as any,
      } as any)
      .select()
      .single();

    if (error) throw new DatabaseError('Failed to create notification record', error);
    
    return this.mapToNotification(data);
  }

  /**
   * Send WhatsApp (placeholder for now)
   */
  private async sendWhatsApp(dto: SendNotificationDTO, message: string): Promise<Notification> {
    logger.warn('WhatsApp sending not implemented yet', { phoneNumber: dto.phoneNumber });
    
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        clinic_id: dto.clinicId,
        patient_id: dto.patientId,
        appointment_id: dto.appointmentId,
        channel: dto.channel as any,
        type: dto.type as any,
        phone_number: dto.phoneNumber,
        message,
        status: NotificationStatus.PENDING as any,
      } as any)
      .select()
      .single();

    if (error) throw new DatabaseError('Failed to create notification record', error);
    
    return this.mapToNotification(data);
  }

  /**
   * Send Push Notification (placeholder for now)
   */
  private async sendPush(dto: SendNotificationDTO, message: string): Promise<Notification> {
    logger.warn('Push notifications not implemented yet');
    
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        clinic_id: dto.clinicId,
        patient_id: dto.patientId,
        appointment_id: dto.appointmentId,
        channel: dto.channel as any,
        type: dto.type as any,
        message,
        status: NotificationStatus.PENDING as any,
      } as any)
      .select()
      .single();

    if (error) throw new DatabaseError('Failed to create notification record', error);
    
    return this.mapToNotification(data);
  }

  /**
   * Render notification template with variables
   */
  private async renderTemplate(
    clinicId: string,
    type: NotificationType,
    variables: Record<string, string>
  ): Promise<string> {
    try {
      // Try to get custom clinic template first
      const { data: template } = await supabase
        .from('notification_templates')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('template_key', type)
        .eq('language', 'ar') // Default to Arabic for Morocco
        .eq('is_active', true)
        .single();

      // Fallback to default system templates
      let templateText = template?.template_text;
      
      if (!templateText) {
        templateText = this.getDefaultTemplate(type);
      }

      // Replace variables in template
      let message = templateText;
      Object.entries(variables).forEach(([key, value]) => {
        message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
      });

      return message;
      
    } catch (error) {
      logger.warn('Template fetch failed, using default', { type });
      return this.getDefaultTemplate(type);
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
  private mapToNotification(data: any): Notification {
    return {
      id: data.id,
      clinicId: data.clinic_id,
      patientId: data.patient_id,
      appointmentId: data.appointment_id,
      channel: data.channel as NotificationChannel,
      type: data.type as NotificationType,
      phoneNumber: data.phone_number,
      email: data.email,
      message: data.message,
      status: data.status as NotificationStatus,
      sentAt: data.sent_at ? new Date(data.sent_at) : undefined,
      deliveredAt: data.delivered_at ? new Date(data.delivered_at) : undefined,
      failureReason: data.failure_reason,
      metadata: data.metadata,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }
}
