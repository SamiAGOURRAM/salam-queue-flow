/**
 * Core Errors - Custom error types for consistent error handling
 */

/**
 * Base application error
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  
  constructor(
    message: string,
    code: string = 'APP_ERROR',
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
  }
}

/**
 * Validation error - Invalid input data
 */
export class ValidationError extends AppError {
  public readonly field?: string;
  
  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.field = field;
  }
}

/**
 * Not found error - Resource doesn't exist
 */
export class NotFoundError extends AppError {
  public readonly resource: string;
  public readonly id?: string;
  
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with ID '${id}' not found` : `${resource} not found`,
      'NOT_FOUND',
      404
    );
    this.resource = resource;
    this.id = id;
  }
}

/**
 * Authorization error - User not authorized
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Not authorized to perform this action') {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

/**
 * Authentication error - User not authenticated
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

/**
 * Conflict error - Resource conflict (e.g., duplicate booking)
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT_ERROR', 409);
  }
}

/**
 * Database error - Database operation failed
 */
export class DatabaseError extends AppError {
  public readonly originalError?: Error;
  
  constructor(message: string, originalError?: Error) {
    super(message, 'DATABASE_ERROR', 500);
    this.originalError = originalError;
  }
}

/**
 * Business rule error - Business logic violation
 */
export class BusinessRuleError extends AppError {
  public readonly rule: string;
  
  constructor(message: string, rule: string) {
    super(message, 'BUSINESS_RULE_ERROR', 422);
    this.rule = rule;
  }
}

/**
 * External service error - Third-party service failure
 */
export class ExternalServiceError extends AppError {
  public readonly service: string;
  
  constructor(service: string, message: string) {
    super(`${service} service error: ${message}`, 'EXTERNAL_SERVICE_ERROR', 502);
    this.service = service;
  }
}

