/**
 * Structured Logger for QueueMed
 * Provides consistent logging across the application with context and metadata
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

interface LogContext {
  userId?: string;
  clinicId?: string;
  sessionId?: string;
  requestId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

class Logger {
  private context: LogContext = {};
  private isDevelopment = import.meta.env.DEV;

  /**
   * Set global context that will be included in all logs
   */
  setContext(context: Partial<LogContext>): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * Clear global context
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * Log a debug message
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * Log an info message
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  /**
   * Log a warning message
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  /**
   * Log an error message
   */
  error(message: string, error?: Error, metadata?: Record<string, unknown>): void {
    const errorInfo = error ? {
      name: error.name,
      message: error.message,
      stack: this.isDevelopment ? error.stack : undefined,
    } : undefined;

    this.log(LogLevel.ERROR, message, metadata, errorInfo);
  }

  /**
   * Internal log method
   */
  private log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
    error?: LogEntry['error']
  ): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: Object.keys(this.context).length > 0 ? this.context : undefined,
      metadata,
      error,
    };

    // In development, log pretty-printed to console
    if (this.isDevelopment) {
      this.logToConsole(logEntry);
    } else {
      // In production, log as JSON for log aggregation tools (Logtail, Sentry, etc.)
      console.log(JSON.stringify(logEntry));
    }
  }

  /**
   * Pretty-print logs to console in development
   */
  private logToConsole(entry: LogEntry): void {
    const emoji = {
      [LogLevel.DEBUG]: '🔍',
      [LogLevel.INFO]: 'ℹ️',
      [LogLevel.WARN]: '⚠️',
      [LogLevel.ERROR]: '❌',
    };

    const style = {
      [LogLevel.DEBUG]: 'color: gray',
      [LogLevel.INFO]: 'color: blue',
      [LogLevel.WARN]: 'color: orange',
      [LogLevel.ERROR]: 'color: red; font-weight: bold',
    };

    console.log(
      `%c${emoji[entry.level]} [${entry.level.toUpperCase()}] ${entry.message}`,
      style[entry.level]
    );

    if (entry.context) {
      console.log('  Context:', entry.context);
    }
    if (entry.metadata) {
      console.log('  Metadata:', entry.metadata);
    }
    if (entry.error) {
      console.error('  Error:', entry.error);
    }
  }
}

// Export singleton instance
export const logger = new Logger();
export { Logger };