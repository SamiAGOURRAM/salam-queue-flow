/**
 * INotifier port — unit tests
 *
 * Verifies the messaging seam: core defaults to a no-op notifier (runs with no
 * provider) and the container accepts a swapped-in adapter.
 */
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { NoOpNotifier, type INotifier } from './notifier.js';
import { createServiceContainer } from '../container.js';

// Construction never touches the client, so a bare stub is enough.
const stubClient = {} as unknown as SupabaseClient;

describe('INotifier port', () => {
  it('NoOpNotifier skips delivery (no provider)', async () => {
    const result = await new NoOpNotifier().notify({
      clinicId: 'c1',
      patientId: 'p1',
      channel: 'sms',
      type: 'appointment_confirmed',
      phoneNumber: '+212600000000',
    });
    expect(result).toEqual({ id: 'noop', status: 'skipped' });
  });

  it('container defaults the notifier to a no-op', async () => {
    const container = createServiceContainer({ supabaseClient: stubClient });
    const result = await container.notifier.notify({
      clinicId: 'c1',
      patientId: 'p1',
      channel: 'whatsapp',
      type: 'your_turn',
    });
    expect(result.status).toBe('skipped');
  });

  it('container uses an injected notifier adapter (messaging is swappable)', async () => {
    const fake: INotifier = { notify: vi.fn().mockResolvedValue({ id: 'n1', status: 'sent' }) };
    const container = createServiceContainer({ supabaseClient: stubClient, notifier: fake });

    const result = await container.notifier.notify({
      clinicId: 'c1',
      patientId: 'p1',
      channel: 'email',
      type: 'appointment_cancelled',
      email: 'p@example.com',
    });

    expect(fake.notify).toHaveBeenCalledOnce();
    expect(result).toEqual({ id: 'n1', status: 'sent' });
  });
});
