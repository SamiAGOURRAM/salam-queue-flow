/**
 * Supabase JWT validation for the chat API.
 *
 * Uses the anon key + Supabase Auth REST API to verify the caller's JWT.
 * This is the same approach the MCP server uses — `getUser()` validates the
 * token signature, expiry, and audience against the Supabase project.
 *
 * Behaviour:
 *  - If SUPABASE_URL is configured → validate tokens. Missing/invalid → 401.
 *  - If SUPABASE_URL is NOT configured → skip validation (local dev fallback).
 *    A startup warning is logged so this is never silent in production.
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
 * Validate a Bearer token against the configured Supabase project.
 *
 * Returns `{ authenticated: true, userId, error: null }` on success.
 * Returns `{ authenticated: false, userId: null, error }` on failure.
 *
 * When no Supabase URL is configured (local dev) this always returns
 * authenticated — a startup warning is logged so production deployments
 * know to set it.
 */
export async function validateToken(token: string | undefined): Promise<AuthResult> {
  const client = getClient();

  // No Supabase configured → skip validation (dev mode).
  if (!client) {
    return { authenticated: true, userId: null, error: null };
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
