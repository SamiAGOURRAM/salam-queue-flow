/**
 * Supabase Client Adapter
 * 
 * Provides:
 *  1. A singleton service-role client for JWT validation (`getSupabaseClient`).
 *  2. Per-request JWT-scoped clients for data queries (`getJwtScopedClient`).
 *
 * The service-role client is ONLY used to call `supabase.auth.getUser()`.
 * All data queries use the JWT-scoped client so Postgres RLS enforces
 * the caller's permissions.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../../config.js";
import { ConfigurationError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

let supabaseClient: SupabaseClient | null = null;

/**
 * Get the service-role Supabase client instance (singleton).
 * ONLY use this for `auth.getUser()` — never for data queries.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    if (!config.supabaseUrl || !config.supabaseServiceKey) {
      throw new ConfigurationError(
        "Missing Supabase configuration. Ensure SUPABASE_URL and SUPABASE_SERVICE_KEY are set."
      );
    }

    logger.debug("Initializing Supabase client", {
      url: config.supabaseUrl.substring(0, 30) + "...",
    });

    supabaseClient = createClient(
      config.supabaseUrl,
      config.supabaseServiceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        // Disable realtime for server-side usage
        realtime: {
          params: {
            eventsPerSecond: 0,
          },
        },
      }
    );

    logger.info("Supabase client initialized");
  }

  return supabaseClient;
}

/**
 * Get a JWT-scoped Supabase client for the given user token.
 * Uses the anon key + the caller's JWT so Postgres RLS enforces
 * the user's permissions on every query.
 *
 * Call this for ALL data queries during auth context building and
 * tool execution. The client is NOT cached — callers should hold
 * the reference for the duration of a single request.
 */
export function getJwtScopedClient(token: string): SupabaseClient {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new ConfigurationError(
      "Missing Supabase configuration. SUPABASE_URL and SUPABASE_ANON_KEY are required " +
      "for JWT-scoped queries."
    );
  }
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
    realtime: { params: { eventsPerSecond: 0 } },
  });
}

/**
 * Reset the service-role client (useful for testing)
 */
export function resetSupabaseClient(): void {
  supabaseClient = null;
}

/**
 * Test database connectivity
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const client = getSupabaseClient();
    
    // Simple query to test connection
    const { error } = await client
      .from("clinics")
      .select("id")
      .limit(1);

    if (error) {
      logger.error("Database connection test failed", { error: error.message });
      return false;
    }

    logger.info("Database connection test successful");
    return true;
  } catch (error) {
    logger.error("Database connection test error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

