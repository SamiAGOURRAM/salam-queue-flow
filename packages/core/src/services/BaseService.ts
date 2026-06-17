/**
 * Base Service - Shared logging lifecycle for all core services
 *
 * Provides `executeWithLogging()` helpers that eliminate the repetitive
 * setContext → try → catch → clearContext boilerplate across service methods.
 *
 * The `fn` callback is responsible for its own success logging (method-specific
 * details differ per method). The base class handles:
 *   - setContext before fn
 *   - debug log with operation name
 *   - error logging + re-throw if fn throws
 *   - clearContext in finally (always)
 */
import type { ILogger } from '../ports/logger.js';

export abstract class BaseService {
  constructor(protected readonly logger: ILogger) {}

  /**
   * Execute an operation with standard logging lifecycle.
   *
   * Sets the logger context with { operation, ...context }, logs a debug entry,
   * calls `fn`, and always clears the context in `finally`.
   *
   * If `fn` throws, the error is logged and re-thrown.
   *
   * @param operation - Short operation name (included in context as `operation`)
   * @param context - Extra fields merged into log context (should include `service`)
   * @param fn - Business-logic closure. Call `this.logger.info()` inside for success logging.
   */
  protected async executeWithLogging<T>(
    operation: string,
    context: Record<string, unknown>,
    fn: () => Promise<T>,
  ): Promise<T> {
    this.logger.setContext({ ...context, operation });
    try {
      this.logger.debug(`Executing ${operation}`);
      return await fn();
    } catch (error) {
      this.logger.error(`${operation} failed`, error as Error);
      throw error;
    } finally {
      this.logger.clearContext();
    }
  }

  /**
   * Execute a void operation with standard logging lifecycle.
   * Same as `executeWithLogging` but for methods that return `void`.
   */
  protected async executeVoid(
    operation: string,
    context: Record<string, unknown>,
    fn: () => Promise<void>,
  ): Promise<void> {
    await this.executeWithLogging(operation, context, fn);
  }
}
