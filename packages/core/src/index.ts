/**
 * @queuemed/core - Main entry point
 * 
 * This package provides all business logic for QueueMed applications.
 * Services are environment-agnostic and use dependency injection.
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================
// NOTE: directory barrels carry an explicit `/index.js` so the emitted .d.ts is
// resolvable by NodeNext/Node-ESM consumers (e.g. @queuemed/mcp-server). Bundler
// resolution (this package) and Vite (web) both accept the extension. Without it,
// a NodeNext consumer with skipLibCheck silently sees zero exports from the barrel.
export * from './types/index.js';

// ============================================================================
// PORTS (Interfaces for external dependencies)
// ============================================================================
export * from './ports/index.js';

// ============================================================================
// ERRORS
// ============================================================================
export * from './errors/index.js';

// ============================================================================
// SERVICES
// ============================================================================
export * from './services/index.js';

// ============================================================================
// REPOSITORIES
// ============================================================================
export * from './repositories/index.js';

// ============================================================================
// SERVICE FACTORY (Convenience for creating services with dependencies)
// ============================================================================
export { createServiceContainer } from './container';
export type { ServiceContainer, ContainerConfig } from './container';

