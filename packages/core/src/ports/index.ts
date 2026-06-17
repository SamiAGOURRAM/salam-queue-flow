/**
 * Ports - Interfaces for external dependencies
 * 
 * These define the contracts that adapters must implement.
 * This allows the core business logic to be independent of:
 * - Database implementation (Supabase, PostgreSQL, etc.)
 * - Logging implementation (Console, Winston, etc.)
 * - Event bus implementation (In-memory, Redis, etc.)
 * - Messaging implementation (Twilio/Edge Functions, no-op, etc.)
 */

export * from './logger.js';
export * from './eventBus.js';
export * from './notifier.js';

// Repository ports — true hexagonal ports for data access.
// Swap implementations by writing a new adapter (no business-logic changes).
export * from './repositories/index.js';

// Auth ports — swap auth providers by writing a new adapter.
export * from './auth/index.js';

