/**
 * Notifier Port - Interface for outbound messaging (SMS / WhatsApp / email / push)
 *
 * Core business logic (and the AI agent) request a notification through this
 * port without knowing the concrete channel/provider. The adapter that actually
 * delivers (Twilio/Edge Functions/etc.) is supplied at the composition root, so
 * messaging is swappable — the web app injects its `NotificationService`, tests
 * and offline dev get the `NoOpNotifier`, and a different provider is just a new
 * adapter.
 */

/** Delivery channel. Channel is a parameter, not a separate port per channel. */
export type NotifyChannel = 'sms' | 'whatsapp' | 'email' | 'push';

/** A request to send one notification on one channel. */
export interface NotifyRequest {
  clinicId: string;
  patientId: string;
  appointmentId?: string;
  channel: NotifyChannel;
  /** Notification type key (e.g. 'appointment_confirmed'); resolves the template. */
  type: string;
  phoneNumber?: string;
  email?: string;
  pushToken?: string;
  language?: string;
  /** Template variables for rendering the message. */
  variables?: Record<string, string>;
}

export type NotifyStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'skipped';

export interface NotifyResult {
  /** Id of the persisted notification record, or a sentinel for no-op sends. */
  id: string;
  status: NotifyStatus;
}

export interface INotifier {
  /** Send a notification on the requested channel. */
  notify(request: NotifyRequest): Promise<NotifyResult>;
}

/**
 * No-op notifier (default). Used in tests, offline dev, and any environment
 * without a configured provider — keeps core runnable with no network.
 */
export class NoOpNotifier implements INotifier {
  async notify(_request: NotifyRequest): Promise<NotifyResult> {
    return { id: 'noop', status: 'skipped' };
  }
}
