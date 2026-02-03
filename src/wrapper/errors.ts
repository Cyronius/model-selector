/**
 * Error classification for determining fallback behavior.
 *
 * Error categories:
 * - RATE_LIMIT: Immediate fallback, no retry (quota exhausted)
 * - AUTH: Immediate fallback, no retry (credentials invalid)
 * - TRANSIENT: Retry with backoff (network issues, temporary failures)
 * - INVALID_REQUEST: Fail fast, don't waste fallbacks (bad input)
 * - UNKNOWN: Treat as transient (retry then fallback)
 */

export type ErrorCategory = 'RATE_LIMIT' | 'AUTH' | 'TRANSIENT' | 'INVALID_REQUEST' | 'UNKNOWN';

export interface ClassifiedError {
  category: ErrorCategory;
  original: Error;
  message: string;
  shouldRetry: boolean;
  shouldFallback: boolean;
}

/**
 * Patterns for identifying error types from error messages and status codes.
 */
const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /too.?many.?requests/i,
  /quota.?exceeded/i,
  /capacity/i,
  /overloaded/i,
  /429/,
];

const AUTH_PATTERNS = [
  /unauthorized/i,
  /invalid.?api.?key/i,
  /authentication/i,
  /api.?key.?invalid/i,
  /forbidden/i,
  /401/,
  /403/,
];

const TRANSIENT_PATTERNS = [
  /timeout/i,
  /timed.?out/i,
  /network/i,
  /connection/i,
  /econnrefused/i,
  /econnreset/i,
  /enotfound/i,
  /socket/i,
  /500/,
  /502/,
  /503/,
  /504/,
  /service.?unavailable/i,
  /internal.?server.?error/i,
  /temporarily/i,
];

const INVALID_REQUEST_PATTERNS = [
  /invalid.?request/i,
  /bad.?request/i,
  /validation/i,
  /malformed/i,
  /400/,
  /context.?length/i,
  /token.?limit/i,
  /max.?tokens/i,
  /content.?filter/i,
  /safety/i,
];

function matchesPatterns(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function getErrorText(error: Error): string {
  const parts: string[] = [error.message];

  // Check for common error object properties
  const anyError = error as unknown as Record<string, unknown>;
  if (typeof anyError['status'] === 'number') {
    parts.push(String(anyError['status']));
  }
  if (typeof anyError['statusCode'] === 'number') {
    parts.push(String(anyError['statusCode']));
  }
  if (typeof anyError['code'] === 'string') {
    parts.push(anyError['code']);
  }
  if (typeof anyError['cause'] === 'object' && anyError['cause'] !== null) {
    const cause = anyError['cause'] as Record<string, unknown>;
    if (typeof cause['message'] === 'string') {
      parts.push(cause['message']);
    }
  }

  return parts.join(' ');
}

/**
 * Classify an error to determine how to handle it in the fallback chain.
 */
export function classifyError(error: Error): ClassifiedError {
  const errorText = getErrorText(error);

  // Check patterns in order of specificity
  if (matchesPatterns(errorText, RATE_LIMIT_PATTERNS)) {
    return {
      category: 'RATE_LIMIT',
      original: error,
      message: `Rate limit: ${error.message}`,
      shouldRetry: false,
      shouldFallback: true,
    };
  }

  if (matchesPatterns(errorText, AUTH_PATTERNS)) {
    return {
      category: 'AUTH',
      original: error,
      message: `Authentication error: ${error.message}`,
      shouldRetry: false,
      shouldFallback: true,
    };
  }

  if (matchesPatterns(errorText, INVALID_REQUEST_PATTERNS)) {
    return {
      category: 'INVALID_REQUEST',
      original: error,
      message: `Invalid request: ${error.message}`,
      shouldRetry: false,
      shouldFallback: false, // Don't waste fallbacks on bad input
    };
  }

  if (matchesPatterns(errorText, TRANSIENT_PATTERNS)) {
    return {
      category: 'TRANSIENT',
      original: error,
      message: `Transient error: ${error.message}`,
      shouldRetry: true,
      shouldFallback: true,
    };
  }

  // Default: treat as potentially transient
  return {
    category: 'UNKNOWN',
    original: error,
    message: error.message,
    shouldRetry: true,
    shouldFallback: true,
  };
}

/**
 * Create a combined error from all failed attempts.
 */
export class AllModelsFailedError extends Error {
  public readonly attempts: Array<{ modelName: string; error: Error }>;

  constructor(attempts: Array<{ modelName: string; error: Error }>) {
    const modelNames = attempts.map((a) => a.modelName).join(', ');
    super(`All models failed: ${modelNames}`);
    this.name = 'AllModelsFailedError';
    this.attempts = attempts;
  }
}

/**
 * Timeout error for request timeouts.
 */
export class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}
