/**
 * Database Port - Interface for database operations
 * 
 * This abstracts the database client (Supabase, PostgreSQL, etc.)
 * Repositories use this interface instead of importing Supabase directly.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Database client interface
 * Uses the Supabase client directly for simplicity
 * Can be replaced with a more abstract interface if needed
 */
export interface IDatabaseClient {
  /**
   * Get the underlying Supabase client
   * Used for direct database operations
   */
  getClient(): SupabaseClient;
  
  /**
   * Execute an RPC function
   */
  rpc<T = unknown>(functionName: string, params?: Record<string, unknown>): Promise<{
    data: T | null;
    error: { message: string; code?: string } | null;
  }>;
}

/**
 * Factory type for creating database clients
 */
export type DatabaseClientFactory = () => IDatabaseClient;

/**
 * Supabase adapter that implements IDatabaseClient
 * This is the concrete implementation used in the apps
 */
export class SupabaseAdapter implements IDatabaseClient {
  constructor(private client: SupabaseClient) {}
  
  getClient(): SupabaseClient {
    return this.client;
  }
  
  async rpc<T = unknown>(functionName: string, params?: Record<string, unknown>) {
    const result = await this.client.rpc(functionName, params);
    return {
      data: result.data as T | null,
      error: result.error ? { message: result.error.message, code: result.error.code } : null
    };
  }
}

