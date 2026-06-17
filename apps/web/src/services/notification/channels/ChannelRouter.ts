/**
 * Channel Router
 * Resolves the best reachable channel for a patient.
 *
 * Contact fetching + PII decryption live here (web-specific); the *decision* of
 * which channel to use is delegated to the shared core policy `selectNotifyRoute`
 * so the web UI and the AI agent route identically.
 */
import { selectNotifyRoute, type NotifyRoute } from '@queuemed/core';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '../../shared/logging/Logger';
import { NotificationChannel } from '../models/NotificationModels';

export interface ResolvedNotificationRoute {
  channel: NotificationChannel;
  phoneNumber?: string;
  email?: string;
  preferredLanguage: string;
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
        const route = this.toRoute(
          selectNotifyRoute({
            phoneNumber: profile.phone_number,
            email: profile.email,
            preferredLanguage: profile.preferred_language,
            notificationPreferences: profile.notification_preferences,
          }),
        );

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

    return this.toRoute(
      selectNotifyRoute({
        phoneNumber: contact.phone_number,
        email: contact.email,
        preferredLanguage: null,
        notificationPreferences: null,
      }),
    );
  }

  /** Map the core route (NotifyChannel string) to the web shape (enum — identical values). */
  private toRoute(route: NotifyRoute | null): ResolvedNotificationRoute | null {
    if (!route) return null;
    return {
      channel: route.channel as NotificationChannel,
      phoneNumber: route.phoneNumber,
      email: route.email,
      preferredLanguage: route.preferredLanguage,
    };
  }
}
