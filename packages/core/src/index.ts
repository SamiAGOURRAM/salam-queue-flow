/**
 * @queuemed/core - Main entry point
 * 
 * This package provides all business logic for QueueMed applications.
 * Services are environment-agnostic and use dependency injection.
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================
export * from './types';

// ============================================================================
// PORTS (Interfaces for external dependencies)
// ============================================================================
export * from './ports';

// ============================================================================
// ERRORS
// ============================================================================
export * from './errors';

// ============================================================================
// SERVICES
// ============================================================================
export * from './services';

// ============================================================================
// REPOSITORIES
// ============================================================================
export * from './repositories';

// ============================================================================
// SERVICE FACTORY (Convenience for creating services with dependencies)
// ============================================================================
export { createServiceContainer } from './container';
export type { ServiceContainer, ContainerConfig } from './container';

