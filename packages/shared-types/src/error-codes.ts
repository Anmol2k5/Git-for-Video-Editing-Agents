/**
 * Typed error codes for all API responses.
 * Shared between server and client for compile-time safety.
 */
export type ErrorCode =
  | "PROJECT_NOT_FOUND"
  | "SNAPSHOT_NOT_FOUND"
  | "UNAUTHORIZED"
  | "RATE_LIMIT_EXCEEDED"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR"
  | "NOT_IMPLEMENTED"
  | "INVALID_PROJECT_PATH"
  | "FILE_NOT_FOUND"
  | "PAIRING_FAILED"
  | "INVALID_REQUEST"
  | "INVALID_SNAPSHOT";

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
  };
}

export function createErrorResponse(code: ErrorCode, message: string): ErrorResponse {
  return { error: { code, message } };
}
