// src/services/core/coreContainer.ts
//
// The web app's single composition root for @queuemed/core. Creating ONE
// container means one shared event bus and one notifier across the app, so
// core domain events (e.g. `appointment.booked` published by core's
// BookingService) can be observed by app-side handlers — the bridge that lets
// core react out to the web (notifications, etc.).
//
// The notifier is the web NotificationService (the production INotifier
// adapter), so any core service that calls `notifier.notify` delivers for real.
import { createServiceContainer } from '@queuemed/core';
import { supabase } from '@/integrations/supabase/client';
import { NotificationService } from '../notification/NotificationService';

export const coreContainer = createServiceContainer({
  supabaseClient: supabase,
  notifier: new NotificationService(),
});
