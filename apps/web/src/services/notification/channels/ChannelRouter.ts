/**
 * Channel Router
 * Resolves the best reachable channel for a patient.
 */

import { supabase } from '@/integrations/supabase/client';
import { Json } from '@/integrations/supabase/types';
import { logger } from '../../shared/logging/Logger';
import { NotificationChannel } from '../models/NotificationModels';

export interface ResolvedNotificationRoute {
  channel: NotificationChannel;
  phoneNumber?: string;
  email?: string;
  preferredLanguage: string;
}

interface ParsedPreferences {
  preferredChannel?: NotificationChannel;
  smsEnabled?: boolean;
  whatsappEnabled?: boolean;
  emailEnabled?: boolean;
}

type DecryptedPatient = {
  phone_number?: string | null;
  email?: string | null;
};

export class ChannelRouter {
  async resolveForPatient(patientId: string): Promise<ResolvedNotificationRoute | null> {
    const patientLookup = await supabase
      .from('patients')
      .select('user_id')
      .eq('id', patientId)
      .maybeSingle();

    if (patientLookup.error) {
      logger.warn('Failed to read patient user mapping for notification routing', {
        patientId,
        error: patientLookup.error.message,
      });
    }

    const userId = patientLookup.data?.user_id ?? null;
    if (userId) {
      const profileLookup = await supabase
        .from('profiles')
        .select('phone_number, email, preferred_language, notification_preferences')
        .eq('id', userId)
        .maybeSingle();

      if (profileLookup.error) {
        logger.warn('Failed to read profile for notification routing', {
          patientId,
          userId,
          error: profileLookup.error.message,
        });
      } else if (profileLookup.data) {
        const profile = profileLookup.data;
        const route = this.chooseRoute({
          phoneNumber: profile.phone_number,
          email: profile.email,
          preferredLanguage: profile.preferred_language,
          preferences: this.parsePreferences(profile.notification_preferences),
        });

        if (route) {
          return route;
        }
      }
    }

    return this.resolveFallbackForWalkIn(patientId);
  }

  private async resolveFallbackForWalkIn(patientId: string): Promise<ResolvedNotificationRoute | null> {
    const decryptedLookup = await supabase.rpc('get_patient_decrypted', {
      p_patient_id: patientId,
    });

    if (decryptedLookup.error) {
      logger.warn('Failed to read decrypted patient contact for notification routing', {
        patientId,
        error: decryptedLookup.error.message,
      });
      return null;
    }

    const contact = (decryptedLookup.data?.[0] ?? null) as DecryptedPatient | null;
    if (!contact) {
      return null;
    }

    return this.chooseRoute({
      phoneNumber: contact.phone_number,
      email: contact.email,
      preferredLanguage: null,
      preferences: {},
    });
  }

  private chooseRoute(input: {
    phoneNumber?: string | null;
    email?: string | null;
    preferredLanguage?: string | null;
    preferences: ParsedPreferences;
  }): ResolvedNotificationRoute | null {
    const phoneNumber = this.normalize(input.phoneNumber);
    const email = this.normalize(input.email);
    const preferredLanguage = input.preferredLanguage || 'ar';

    if (!phoneNumber && !email) {
      return null;
    }

    const preferredChannel = this.resolvePreferredChannel(input.preferences, Boolean(phoneNumber), Boolean(email));
    if (preferredChannel === NotificationChannel.EMAIL && email) {
      return { channel: NotificationChannel.EMAIL, email, preferredLanguage };
    }

    if (preferredChannel === NotificationChannel.WHATSAPP && phoneNumber) {
      return { channel: NotificationChannel.WHATSAPP, phoneNumber, preferredLanguage };
    }

    if (preferredChannel === NotificationChannel.SMS && phoneNumber) {
      return { channel: NotificationChannel.SMS, phoneNumber, preferredLanguage };
    }

    if (phoneNumber) {
      return { channel: NotificationChannel.SMS, phoneNumber, preferredLanguage };
    }

    return { channel: NotificationChannel.EMAIL, email, preferredLanguage };
  }

  private resolvePreferredChannel(
    preferences: ParsedPreferences,
    hasPhoneNumber: boolean,
    hasEmail: boolean
  ): NotificationChannel {
    if (preferences.preferredChannel) {
      return preferences.preferredChannel;
    }

    if (hasPhoneNumber && preferences.whatsappEnabled) {
      return NotificationChannel.WHATSAPP;
    }
    if (hasPhoneNumber && preferences.smsEnabled !== false) {
      return NotificationChannel.SMS;
    }
    if (hasEmail && preferences.emailEnabled !== false) {
      return NotificationChannel.EMAIL;
    }

    return hasPhoneNumber ? NotificationChannel.SMS : NotificationChannel.EMAIL;
  }

  private parsePreferences(preferences: Json | null): ParsedPreferences {
    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
      return {};
    }

    const raw = preferences as Record<string, unknown>;
    const channelsValue =
      raw.channels && typeof raw.channels === 'object' && !Array.isArray(raw.channels)
        ? (raw.channels as Record<string, unknown>)
        : {};

    return {
      preferredChannel: this.parseChannel(raw.preferred_channel ?? raw.preferredChannel),
      smsEnabled: this.parseBoolean(raw.sms_enabled ?? raw.sms ?? channelsValue.sms),
      whatsappEnabled: this.parseBoolean(raw.whatsapp_enabled ?? raw.whatsapp ?? channelsValue.whatsapp),
      emailEnabled: this.parseBoolean(raw.email_enabled ?? raw.email ?? channelsValue.email),
    };
  }

  private parseChannel(value: unknown): NotificationChannel | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.toLowerCase();
    switch (normalized) {
      case NotificationChannel.SMS:
      case NotificationChannel.WHATSAPP:
      case NotificationChannel.EMAIL:
      case NotificationChannel.PUSH:
        return normalized;
      default:
        return undefined;
    }
  }

  private parseBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') {
      return value;
    }
    return undefined;
  }

  private normalize(value: string | null | undefined): string | undefined {
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
}
