/**
 * Notification Template Service
 * Fetches clinic/system templates with language fallback and renders variables.
 */

import { supabase } from '@/integrations/supabase/client';
import { logger } from '../../shared/logging/Logger';
import { NotificationType } from '../models/NotificationModels';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class NotificationTemplateService {
  async render(
    clinicId: string,
    type: NotificationType,
    variables: Record<string, string>,
    language = 'ar'
  ): Promise<string> {
    const templateText = await this.resolveTemplate(clinicId, type, language);
    let message = templateText;

    Object.entries(variables).forEach(([key, value]) => {
      message = message.replace(new RegExp(`\\{\\{${escapeRegExp(key)}\\}\\}`, 'g'), value);
    });

    return message;
  }

  private async resolveTemplate(clinicId: string, type: NotificationType, language: string): Promise<string> {
    const templateKey = this.toTemplateKey(type);
    const languages = this.buildLanguageFallback(language);

    for (const candidateLanguage of languages) {
      const clinicTemplate = await supabase
        .from('notification_templates')
        .select('template_text')
        .eq('clinic_id', clinicId)
        .eq('template_key', templateKey)
        .eq('language', candidateLanguage)
        .eq('is_active', true)
        .maybeSingle();

      if (clinicTemplate.error) {
        logger.warn('Failed loading clinic notification template', {
          clinicId,
          templateKey,
          language: candidateLanguage,
          error: clinicTemplate.error.message,
        });
      }

      if (clinicTemplate.data?.template_text) {
        return clinicTemplate.data.template_text;
      }

      const systemTemplate = await supabase
        .from('notification_templates')
        .select('template_text')
        .is('clinic_id', null)
        .eq('template_key', templateKey)
        .eq('language', candidateLanguage)
        .eq('is_active', true)
        .maybeSingle();

      if (systemTemplate.error) {
        logger.warn('Failed loading system notification template', {
          templateKey,
          language: candidateLanguage,
          error: systemTemplate.error.message,
        });
      }

      if (systemTemplate.data?.template_text) {
        return systemTemplate.data.template_text;
      }
    }

    return this.getDefaultTemplate(type);
  }

  private buildLanguageFallback(language: string): string[] {
    const normalized = language.trim().toLowerCase();
    if (!normalized) {
      return ['ar'];
    }

    const short = normalized.includes('-') ? normalized.split('-')[0] : normalized;
    const values = [normalized, short, 'ar'];
    return values.filter((value, index) => values.indexOf(value) === index);
  }

  private toTemplateKey(type: NotificationType): string {
    switch (type) {
      case NotificationType.PATIENT_ABSENT:
      case NotificationType.GRACE_PERIOD_ENDING:
        return NotificationType.POSITION_UPDATE;
      default:
        return type;
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
}
