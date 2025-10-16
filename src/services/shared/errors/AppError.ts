/**
 * Base Application Error
 * All custom errors extend from this class
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly isOperational: boolean = true,
    public readonly metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Resource Not Found Error (404)
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string | number, metadata?: Record<string, unknown>) {
    const message = identifier 
      ? `${resource} with ID '${identifier}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404, true, metadata);
  }
}

/**
 * Validation Error (400)
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly validationErrors?: Record<string, string[]>,
    metadata?: Record<string, unknown>
  ) {
    super(message, 'VALIDATION_ERROR', 400, true, { ...metadata, validationErrors });
  }
}

/**
 * Unauthorized Error (401)
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized access', metadata?: Record<string, unknown>) {
    super(message, 'UNAUTHORIZED', 401, true, metadata);
  }
}

/**
 * Forbidden Error (403)
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access forbidden', metadata?: Record<string, unknown>) {
    super(message, 'FORBIDDEN', 403, true, metadata);
  }
}

/**
 * Conflict Error (409)
 * Used for duplicate resources or business rule violations
 */
export class ConflictError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, true, metadata);
  }
}

/**
 * Database Error (500)
 */
export class DatabaseError extends AppError {
  constructor(message: string, originalError?: Error, metadata?: Record<string, unknown>) {
    super(
      message,
      'DATABASE_ERROR',
      500,
      false, // Not operational - indicates system issue
      { ...metadata, originalError: originalError?.message }
    );
  }
}

/**
 * External Service Error (502)
 * Used when external APIs (Twilio, etc.) fail
 */
export class ExternalServiceError extends AppError {
  constructor(
    serviceName: string,
    message: string,
    originalError?: Error,
    metadata?: Record<string, unknown>
  ) {
    super(
      `${serviceName} error: ${message}`,
      'EXTERNAL_SERVICE_ERROR',
      502,
      true,
      { ...metadata, serviceName, originalError: originalError?.message }
    );
  }
}

/**
 * Business Logic Error (422)
 * Used when business rules are violated
 */
export class BusinessRuleError extends AppError {
  constructor(message: string, metadata?: Record<string, unknown>) {
    super(message, 'BUSINESS_RULE_VIOLATION', 422, true, metadata);
  }
}

/**
 * Rate Limit Error (429)
 */
export class RateLimitError extends AppError {
  constructor(
    message: string = 'Too many requests',
    public readonly retryAfter?: number,
    metadata?: Record<string, unknown>
  ) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, true, { ...metadata, retryAfter });
  }
}
