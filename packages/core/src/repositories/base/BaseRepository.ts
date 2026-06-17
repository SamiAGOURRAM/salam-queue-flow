/**
 * Base Repository - Common repository functionality
 *
 * All repositories extend this base class which provides:
 * - Supabase client access
 * - Logging
 * - Common error handling
 *
 * NOTE: The true hexagonal ports are the repository interfaces
 * (IBookingRepository, IClinicRepository, etc.) in ports/repositories/.
 * This base class is an implementation detail shared by the Supabase
 * adapters. To swap databases, write a new adapter that implements the
 * repository interface without extending this class.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ILogger } from '../../ports/logger.js';
import { DatabaseError } from '../../errors.js';

export abstract class BaseRepository {
  protected readonly client: SupabaseClient;
  protected readonly logger: ILogger;
  protected readonly repositoryName: string;

  constructor(client: SupabaseClient, logger: ILogger, repositoryName: string) {
    this.client = client;
    this.logger = logger;
    this.repositoryName = repositoryName;
  }

  /**
   * Execute an RPC call with error handling
   */
  protected async executeRpc<T>(
    functionName: string,
    params: Record<string, unknown>,
    errorMessage: string
  ): Promise<T> {
    const { data, error } = await this.client.rpc(functionName, params);

    if (error) {
      this.logger.error(`${this.repositoryName}: ${errorMessage}`, new Error(error.message), {
        function: functionName,
        params,
      });
      throw new DatabaseError(errorMessage, new Error(error.message));
    }

    return data as T;
  }

  /**
   * Log a debug message with repository context
   */
  protected logDebug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(`${this.repositoryName}: ${message}`, meta);
  }

  /**
   * Log an info message with repository context
   */
  protected logInfo(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(`${this.repositoryName}: ${message}`, meta);
  }

  /**
   * Log an error with repository context
   */
  protected logError(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.logger.error(`${this.repositoryName}: ${message}`, error, meta);
  }
}

