/**
 * MCP Service Container
 *
 * Provides @queuemed/core services to the MCP tools. Crucially, queries run
 * under the CALLER's identity so Postgres RLS is the security backstop:
 *
 *  - authenticated request → container built with the anon key + the user's
 *    JWT (Authorization: Bearer). PostgREST authenticates as `authenticated`,
 *    so RLS applies and `auth.uid()` inside SECURITY DEFINER RPCs is the user.
 *  - anonymous request     → anon-key container (RLS as `anon`).
 *  - service-role          → only used for trusted server-side auth validation
 *    (see adapters/supabase/client.ts), never for tool data access.
 *
 * The per-request JWT-scoped container is memoized on the request store.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServiceContainer, type ServiceContainer } from "@queuemed/core";
import { config } from "../config.js";
import { getRequestStore } from "../middleware/auth/requestContext.js";
import { logger } from "../utils/logger.js";
import { CoreLoggerAdapter } from "./loggerAdapter.js";
import { LoggingNotifier } from "./notifier.js";
import { subscribeBookingConfirmation } from "./bookingNotification.js";

let serviceRoleContainer: ServiceContainer | null = null;
let anonContainer: ServiceContainer | null = null;

// Core services use the default ConsoleLogger which writes to stdout — that
// corrupts the MCP stdio protocol.  Every container MUST use CoreLoggerAdapter
// so all core-service log output goes to stderr instead.
const coreLogger = new CoreLoggerAdapter();

// Single notifier adapter shared across containers (stateless placeholder).
const notifier = new LoggingNotifier();

function makeClient(key: string, jwt?: string): SupabaseClient {
  return createClient(config.supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(jwt ? { global: { headers: { Authorization: `Bearer ${jwt}` } } } : {}),
  });
}

/**
 * Build a core container wired with the MCP notifier + booking-confirmation
 * handler, so an agent booking (`appointment.booked`) triggers a confirmation
 * resolved/delivered under the same RLS-scoped client as the booking.
 */
function buildContainer(client: SupabaseClient): ServiceContainer {
  const container = createServiceContainer({ supabaseClient: client, logger: coreLogger, notifier });
  subscribeBookingConfirmation(container);
  return container;
}

/** Service-role container (RLS-bypassing). Kept as a fallback only. */
export function initializeServices(): ServiceContainer {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    throw new Error(
      "Missing Supabase configuration. Ensure SUPABASE_URL and SUPABASE_SERVICE_KEY are set."
    );
  }
  if (!serviceRoleContainer) {
    logger.info("Initializing service-role container (fallback)");
    serviceRoleContainer = buildContainer(makeClient(config.supabaseServiceKey));
  }
  return serviceRoleContainer;
}

/** Anon container (RLS as `anon`). Config validation at startup
 *  ensures SUPABASE_ANON_KEY is set, so this never falls back. */
function getAnonContainer(): ServiceContainer {
  if (!anonContainer) {
    anonContainer = buildContainer(makeClient(config.supabaseAnonKey));
  }
  return anonContainer;
}

/**
 * Resolve the service container for the current request.
 * Authenticated → JWT-scoped (RLS as the user); else → anon.
 */
export function getServices(): ServiceContainer {
  const store = getRequestStore();

  if (store?.token && config.supabaseAnonKey) {
    if (!store.services) {
      store.services = buildContainer(makeClient(config.supabaseAnonKey, store.token));
    }
    return store.services as ServiceContainer;
  }

  return getAnonContainer();
}

export function getBookingService() {
  return getServices().booking;
}

export function getQueueService() {
  return getServices().queue;
}

export function getClinicService() {
  return getServices().clinic;
}

export function getPatientService() {
  return getServices().patient;
}

export function areServicesInitialized(): boolean {
  return serviceRoleContainer !== null || anonContainer !== null;
}

/** Reset cached containers (for testing). */
export function resetServices(): void {
  serviceRoleContainer = null;
  anonContainer = null;
}
