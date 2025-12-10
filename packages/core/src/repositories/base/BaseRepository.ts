/**
 * Base Repository - Common repository functionality
 * 
 * All repositories extend this base class which provides:
 * - Database client access
 * - Logging
 * - Common error handling
 */

import type { IDatabaseClient } from '../../ports/database';
import type { ILogger } from '../../ports/logger';
import { DatabaseError } from '../../errors';

export abstract class BaseRepository {
  protected readonly db: IDatabaseClient;
  protected readonly logger: ILogger;
  protected readonly repositoryName: string;
  
  constructor(db: IDatabaseClient, logger: ILogger, repositoryName: string) {
    this.db = db;
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
    const result = await this.db.rpc<T>(functionName, params);
    
    if (result.error) {
      this.logger.error(`${this.repositoryName}: ${errorMessage}`, new Error(result.error.message), {
        function: functionName,
        params
      });
      throw new DatabaseError(errorMessage, new Error(result.error.message));
    }
    
    return result.data as T;
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

