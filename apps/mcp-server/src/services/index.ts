/**
 * MCP Service Container
 * 
 * Initializes and provides access to @queuemed/core services.
 * This ensures ONE SOURCE OF TRUTH for all business logic.
 * 
 * The MCP tools are now THIN WRAPPERS around these services.
 */

import { createClient } from "@supabase/supabase-js";
import {
  createServiceContainer,
  type ServiceContainer,
} from "@queuemed/core";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

// Singleton service container
let serviceContainer: ServiceContainer | null = null;

/**
 * Initialize the service container
 * Must be called before using any services
 */
export function initializeServices(): ServiceContainer {
  if (serviceContainer) {
    return serviceContainer;
  }

  const supabaseUrl = config.supabaseUrl;
  const supabaseKey = config.supabaseServiceKey;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase configuration. Ensure SUPABASE_URL and SUPABASE_SERVICE_KEY are set."
    );
  }

  logger.info("Initializing @queuemed/core services", {
    supabaseUrl: supabaseUrl.substring(0, 30) + "...",
  });

  // Create Supabase client
  const supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Create service container
  // The container uses default logger and eventBus internally
  serviceContainer = createServiceContainer({
    supabaseClient,
  });

  logger.info("Services initialized successfully");

  return serviceContainer;
}

/**
 * Get the service container
 * Throws if not initialized
 */
export function getServices(): ServiceContainer {
  if (!serviceContainer) {
    return initializeServices();
  }
  return serviceContainer;
}

/**
 * Get booking service
 */
export function getBookingService() {
  return getServices().booking;
}

/**
 * Get queue service
 */
export function getQueueService() {
  return getServices().queue;
}

/**
 * Get clinic service
 */
export function getClinicService() {
  return getServices().clinic;
}

/**
 * Get patient service
 */
export function getPatientService() {
  return getServices().patient;
}

/**
 * Check if services are initialized
 */
export function areServicesInitialized(): boolean {
  return serviceContainer !== null;
}

/**
 * Reset services (for testing)
 */
export function resetServices(): void {
  serviceContainer = null;
}

