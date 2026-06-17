/**
 * Supabase JWT validation for the chat API.
 *
 * Uses the anon key + Supabase Auth REST API to verify the caller's JWT.
 * This is the same approach the MCP server uses — `getUser()` validates the
 * token signature, expiry, and audience against the Supabase project.
 *
 * Behaviour (fail closed):
 *  - If Supabase is configured → validate tokens. Missing/invalid → 401.
 *  - If Supabase is NOT configured → requests are rejected, EXCEPT a local-dev
 *    opt-in (`ALLOW_UNAUTHENTICATED=true` and NODE_ENV !== 'production').
 *  - `assertAuthConfigured()` crashes the process at startup in production when
 *    auth is unconfigured, so the dev bypass can never be reached in prod.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

// Lazy singleton: only create the Supabase client if we have a URL.
let _supabase: ReturnType<typeof createClient> | null = null;

function getClient(): ReturnType<typeof createClient> | null {
  if (_supabase) return _supabase;
  if (!config.supabaseUrl) return null;
  if (!config.supabaseAnonKey) {
    console.warn(
      "[chat-api] SUPABASE_ANON_KEY is not set — auth validation disabled.",
    );
    return null;
  }
  _supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _supabase;
}

export interface AuthResult {
  authenticated: boolean;
  userId: string | null;
  error: string | null;
}

/**
 * Fail-fast startup guard. In production, auth MUST be configured; if it isn't,
 * throw so the process crashes at boot rather than silently serving the dev
 * bypass at runtime. Call once during server startup.
 */
export function assertAuthConfigured(): void {
  if (config.nodeEnv === "production" && !getClient()) {
    throw new Error(
      "[chat-api] FATAL: SUPABASE_URL and SUPABASE_ANON_KEY must be set in production for JWT validation.",
    );
  }
}

/**
 * Validate a Bearer token against the configured Supabase project.
 *
 * Returns `{ authenticated: true, userId, error: null }` on success.
 * Returns `{ authenticated: false, userId: null, error }` on failure.
 *
 * Fail closed: when Supabase is not configured, requests are rejected unless an
 * explicit local-dev opt-in is set (`ALLOW_UNAUTHENTICATED=true` outside
 * production). Production never reaches the bypass — see `assertAuthConfigured`.
 */
export async function validateToken(token: string | undefined): Promise<AuthResult> {
  const client = getClient();

  // No Supabase configured. Fail closed, except an explicit non-prod dev opt-in.
  if (!client) {
    if (config.nodeEnv !== "production" && config.allowUnauthenticated) {
      return { authenticated: true, userId: null, error: null };
    }
    return { authenticated: false, userId: null, error: "Authentication is not configured" };
  }

  if (!token) {
    return { authenticated: false, userId: null, error: "Missing Authorization header" };
  }

  const { data, error } = await client.auth.getUser(token);

  if (error || !data.user) {
    return {
      authenticated: false,
      userId: null,
      error: error?.message ?? "Invalid token",
    };
  }

  return { authenticated: true, userId: data.user.id, error: null };
}
