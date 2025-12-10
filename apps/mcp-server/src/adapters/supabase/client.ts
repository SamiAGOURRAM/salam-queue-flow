/**
 * Supabase Client Adapter
 * 
 * Provides a singleton Supabase client configured with service role key
 * for server-side operations that bypass RLS.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../../config.js";
import { ConfigurationError } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";

let supabaseClient: SupabaseClient | null = null;

/**
 * Get the Supabase client instance (singleton)
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
 * Reset the client (useful for testing)
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

