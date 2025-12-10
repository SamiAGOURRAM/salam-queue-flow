/**
 * Ports - Interfaces for external dependencies
 * 
 * These define the contracts that adapters must implement.
 * This allows the core business logic to be independent of:
 * - Database implementation (Supabase, PostgreSQL, etc.)
 * - Logging implementation (Console, Winston, etc.)
 * - Event bus implementation (In-memory, Redis, etc.)
 */

export * from './database';
export * from './logger';
export * from './eventBus';

