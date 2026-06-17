/**
 * selectNotifyRoute — shared channel-selection policy tests
 */
import { describe, it, expect } from 'vitest';
import { selectNotifyRoute } from './channelPolicy.js';

describe('selectNotifyRoute', () => {
  it('returns null when there is no reachable contact', () => {
    expect(selectNotifyRoute({})).toBeNull();
    expect(selectNotifyRoute({ phoneNumber: '  ', email: '' })).toBeNull();
  });

  it('defaults to SMS when a phone is present and no preference is set', () => {
    const route = selectNotifyRoute({ phoneNumber: '+212600000000' });
    expect(route).toEqual({ channel: 'sms', phoneNumber: '+212600000000', preferredLanguage: 'ar' });
  });

  it('falls back to email when only email is present', () => {
    const route = selectNotifyRoute({ email: 'p@example.com', preferredLanguage: 'fr' });
    expect(route).toEqual({ channel: 'email', email: 'p@example.com', preferredLanguage: 'fr' });
  });

  it('honors an explicit preferred channel (whatsapp) when reachable', () => {
    const route = selectNotifyRoute({
      phoneNumber: '+212600000000',
      email: 'p@example.com',
      notificationPreferences: { preferred_channel: 'whatsapp' },
    });
    expect(route?.channel).toBe('whatsapp');
    expect(route?.phoneNumber).toBe('+212600000000');
  });

  it('prefers email over the SMS default when preferred_channel=email', () => {
    const route = selectNotifyRoute({
      phoneNumber: '+212600000000',
      email: 'p@example.com',
      notificationPreferences: { preferredChannel: 'email' },
    });
    expect(route?.channel).toBe('email');
  });

  it('uses whatsapp when enabled via flags (no explicit preferred channel)', () => {
    const route = selectNotifyRoute({
      phoneNumber: '+212600000000',
      notificationPreferences: { whatsapp_enabled: true },
    });
    expect(route?.channel).toBe('whatsapp');
  });

  it('skips SMS when explicitly disabled and falls back to email', () => {
    const route = selectNotifyRoute({
      phoneNumber: '+212600000000',
      email: 'p@example.com',
      notificationPreferences: { sms_enabled: false },
    });
    expect(route?.channel).toBe('email');
  });

  it('ignores an unknown preferred channel and falls back to availability', () => {
    const route = selectNotifyRoute({
      phoneNumber: '+212600000000',
      notificationPreferences: { preferred_channel: 'carrier-pigeon' },
    });
    expect(route?.channel).toBe('sms');
  });
});
