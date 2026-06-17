/**
 * Adapter to plug the MCP server logger into @queuemed/core.
 *
 * The core package's default ConsoleLogger writes to stdout, which corrupts
 * the MCP stdio transport. This adapter forwards logs to the MCP logger
 * (stderr) while preserving the ILogger interface expected by core services.
 */
import type { ILogger, LogContext } from "@queuemed/core";
import { logger as mcpLogger } from "../utils/logger.js";

export class CoreLoggerAdapter implements ILogger {
  private context: LogContext = {};

  private mergeContext(meta?: Record<string, unknown>): Record<string, unknown> {
    return { ...this.context, ...(meta || {}) };
  }

  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  clearContext(): void {
    this.context = {};
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    mcpLogger.debug(message, this.mergeContext(meta));
  }

  info(message: string, meta?: Record<string, unknown>): void {
    mcpLogger.info(message, this.mergeContext(meta));
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    mcpLogger.warn(message, this.mergeContext(meta));
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    mcpLogger.error(message, {
      ...this.mergeContext(meta),
      error: error?.message,
      stack: error?.stack,
    });
  }
}

