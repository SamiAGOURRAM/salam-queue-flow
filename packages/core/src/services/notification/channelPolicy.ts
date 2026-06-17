/**
 * Notification channel-selection policy (shared, pure).
 *
 * The single source of truth for "which channel should reach this patient,
 * given their available contact + notification preferences". Contact fetching
 * and PII decryption stay at the edges (web ChannelRouter, MCP via core
 * PatientService); this module owns only the *decision*, so the web UI and the
 * AI agent route identically.
 */
import type { NotifyChannel } from '../../ports/notifier.js';

export interface NotifyRoute {
  channel: NotifyChannel;
  phoneNumber?: string;
  email?: string;
  preferredLanguage: string;
}

interface ParsedPreferences {
  preferredChannel?: NotifyChannel;
  smsEnabled?: boolean;
  whatsappEnabled?: boolean;
  emailEnabled?: boolean;
}

/**
 * Choose the best reachable channel for a patient. Returns null when there is
 * no reachable contact (no phone and no email). Defaults language to `ar`.
 */
export function selectNotifyRoute(input: {
  phoneNumber?: string | null;
  email?: string | null;
  preferredLanguage?: string | null;
  notificationPreferences?: unknown;
}): NotifyRoute | null {
  const phoneNumber = normalize(input.phoneNumber);
  const email = normalize(input.email);
  const preferredLanguage = input.preferredLanguage || 'ar';

  if (!phoneNumber && !email) {
    return null;
  }

  const prefs = parsePreferences(input.notificationPreferences);
  const preferred = resolvePreferredChannel(prefs, Boolean(phoneNumber), Boolean(email));

  if (preferred === 'email' && email) {
    return { channel: 'email', email, preferredLanguage };
  }
  if (preferred === 'whatsapp' && phoneNumber) {
    return { channel: 'whatsapp', phoneNumber, preferredLanguage };
  }
  if (preferred === 'sms' && phoneNumber) {
    return { channel: 'sms', phoneNumber, preferredLanguage };
  }
  if (phoneNumber) {
    return { channel: 'sms', phoneNumber, preferredLanguage };
  }
  return { channel: 'email', email, preferredLanguage };
}

function resolvePreferredChannel(
  preferences: ParsedPreferences,
  hasPhoneNumber: boolean,
  hasEmail: boolean,
): NotifyChannel {
  if (preferences.preferredChannel) {
    return preferences.preferredChannel;
  }
  if (hasPhoneNumber && preferences.whatsappEnabled) {
    return 'whatsapp';
  }
  if (hasPhoneNumber && preferences.smsEnabled !== false) {
    return 'sms';
  }
  if (hasEmail && preferences.emailEnabled !== false) {
    return 'email';
  }
  return hasPhoneNumber ? 'sms' : 'email';
}

function parsePreferences(preferences: unknown): ParsedPreferences {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
    return {};
  }
  const raw = preferences as Record<string, unknown>;
  const channels =
    raw.channels && typeof raw.channels === 'object' && !Array.isArray(raw.channels)
      ? (raw.channels as Record<string, unknown>)
      : {};

  return {
    preferredChannel: parseChannel(raw.preferred_channel ?? raw.preferredChannel),
    smsEnabled: parseBoolean(raw.sms_enabled ?? raw.sms ?? channels.sms),
    whatsappEnabled: parseBoolean(raw.whatsapp_enabled ?? raw.whatsapp ?? channels.whatsapp),
    emailEnabled: parseBoolean(raw.email_enabled ?? raw.email ?? channels.email),
  };
}

function parseChannel(value: unknown): NotifyChannel | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'sms' || normalized === 'whatsapp' || normalized === 'email' || normalized === 'push') {
    return normalized;
  }
  return undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function normalize(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}
