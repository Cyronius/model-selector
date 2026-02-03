/**
 * Error codes for config operations.
 */
export enum ConfigErrorCode {
  // File operations
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  DIRECTORY_NOT_FOUND = 'DIRECTORY_NOT_FOUND',
  WRITE_FAILED = 'WRITE_FAILED',

  // Validation
  INVALID_CONFIG = 'INVALID_CONFIG',
  INVALID_MODEL = 'INVALID_MODEL',
  INVALID_ALIAS = 'INVALID_ALIAS',
  DUPLICATE_MODEL = 'DUPLICATE_MODEL',
  MODEL_NOT_FOUND = 'MODEL_NOT_FOUND',
  ALIAS_NOT_FOUND = 'ALIAS_NOT_FOUND',

  // Provider
  UNKNOWN_PROVIDER = 'UNKNOWN_PROVIDER',

  // Parse/Serialize
  PARSE_ERROR = 'PARSE_ERROR',
  SERIALIZE_ERROR = 'SERIALIZE_ERROR',
}

/**
 * Error class for config operations.
 */
export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly code: ConfigErrorCode
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}
