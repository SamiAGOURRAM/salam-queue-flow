/**
 * Logger Port - Interface for logging
 * 
 * This abstracts the logging implementation.
 * Services use this interface instead of console.log directly.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  service?: string;
  operation?: string;
  clinicId?: string;
  userId?: string;
  [key: string]: unknown;
}

export interface ILogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
  
  setContext(context: LogContext): void;
  clearContext(): void;
}

/**
 * Console logger implementation (default)
 */
export class ConsoleLogger implements ILogger {
  private context: LogContext = {};
  
  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }
  
  clearContext(): void {
    this.context = {};
  }
  
  debug(message: string, meta?: Record<string, unknown>): void {
    console.debug(`[DEBUG] ${message}`, { ...this.context, ...meta });
  }
  
  info(message: string, meta?: Record<string, unknown>): void {
    console.info(`[INFO] ${message}`, { ...this.context, ...meta });
  }
  
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[WARN] ${message}`, { ...this.context, ...meta });
  }
  
  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    console.error(`[ERROR] ${message}`, { 
      ...this.context, 
      ...meta, 
      error: error?.message,
      stack: error?.stack 
    });
  }
}

/**
 * No-op logger for testing or when logging is disabled
 */
export class NoOpLogger implements ILogger {
  setContext(): void {}
  clearContext(): void {}
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

