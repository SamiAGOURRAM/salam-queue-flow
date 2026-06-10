/**
 * WhatsApp delivery channel backed by Supabase Edge Function.
 */

import { supabase } from '@/integrations/supabase/client';
import { ExternalServiceError } from '../../shared/errors';

export interface WhatsAppSendRequest {
  to: string;
  message: string;
  notificationId: string;
}

export interface WhatsAppSendResult {
  providerMessageId?: string;
  raw: Record<string, unknown> | null;
}

export class WhatsAppChannel {
  async send(request: WhatsAppSendRequest): Promise<WhatsAppSendResult> {
    const { data, error } = await supabase.functions.invoke('send-whatsapp', {
      body: {
        to: request.to,
        message: request.message,
        notification_id: request.notificationId,
      },
    });

    if (error) {
      const wrapped = error instanceof Error ? error : new Error('Unknown WhatsApp error');
      throw new ExternalServiceError('Twilio WhatsApp', 'Failed to send WhatsApp message', wrapped);
    }

    const payload = (data && typeof data === 'object' ? (data as Record<string, unknown>) : null);

    return {
      providerMessageId:
        typeof payload?.messageSid === 'string'
          ? payload.messageSid
          : typeof payload?.sid === 'string'
            ? payload.sid
            : undefined,
      raw: payload,
    };
  }
}
