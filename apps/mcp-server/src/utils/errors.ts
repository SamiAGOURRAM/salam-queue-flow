/**
 * Custom Error Classes
 * 
 * Provides typed errors for better error handling and user-friendly messages.
 */

/**
 * Base error class for MCP server errors
 */
export class MCPError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code: string, statusCode: number = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error - invalid input parameters
 */
export class ValidationError extends MCPError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

/**
 * Not found error - resource doesn't exist
 */
export class NotFoundError extends MCPError {
  constructor(resource: string, id?: string) {
    const message = id 
      ? `${resource} with ID '${id}' not found`
      : `${resource} not found`;
    super(message, "NOT_FOUND", 404);
  }
}

/**
 * Authentication error - invalid or missing credentials
 */
export class AuthenticationError extends MCPError {
  constructor(message: string = "Authentication required") {
    super(message, "AUTHENTICATION_ERROR", 401);
  }
}

/**
 * Authorization error - insufficient permissions
 */
export class AuthorizationError extends MCPError {
  constructor(message: string = "Insufficient permissions") {
    super(message, "AUTHORIZATION_ERROR", 403);
  }
}

/**
 * Database error - Supabase/PostgreSQL errors
 */
export class DatabaseError extends MCPError {
  constructor(message: string, originalError?: Error) {
    const fullMessage = originalError 
      ? `${message}: ${originalError.message}`
      : message;
    super(fullMessage, "DATABASE_ERROR", 500);
  }
}

/**
 * External service error - third-party API failures
 */
export class ExternalServiceError extends MCPError {
  constructor(service: string, message: string) {
    super(`${service} error: ${message}`, "EXTERNAL_SERVICE_ERROR", 502);
  }
}

/**
 * Rate limit error - too many requests
 */
export class RateLimitError extends MCPError {
  constructor(message: string = "Rate limit exceeded") {
    super(message, "RATE_LIMIT_ERROR", 429);
  }
}

/**
 * Configuration error - missing or invalid config
 */
export class ConfigurationError extends MCPError {
  constructor(message: string) {
    super(message, "CONFIGURATION_ERROR", 500);
  }
}

/**
 * Format error for MCP tool response
 */
export function formatErrorResponse(error: unknown): {
  content: Array<{ type: string; text: string }>;
  isError: boolean;
} {
  let message: string;
  let code: string;

  if (error instanceof MCPError) {
    message = error.message;
    code = error.code;
  } else if (error instanceof Error) {
    message = error.message;
    code = "INTERNAL_ERROR";
  } else if (typeof error === 'object' && error !== null) {
    // Handle Supabase and other error objects that aren't Error instances
    const errorObj = error as Record<string, unknown>;
    message = (errorObj.message as string) || 
              (errorObj.error as string) || 
              (errorObj.details as string) ||
              JSON.stringify(error);
    code = (errorObj.code as string) || "UNKNOWN_ERROR";
  } else {
    message = String(error);
    code = "UNKNOWN_ERROR";
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: false,
          error: {
            code,
            message,
          },
        }, null, 2),
      },
    ],
    isError: true,
  };
}

