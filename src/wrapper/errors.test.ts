import { describe, it, expect } from 'vitest';
import { classifyError, AllModelsFailedError, TimeoutError } from './errors.js';

describe('classifyError', () => {
  describe('RATE_LIMIT errors', () => {
    it('should classify rate limit errors', () => {
      const error = new Error('Rate limit exceeded');
      const result = classifyError(error);

      expect(result.category).toBe('RATE_LIMIT');
      expect(result.shouldRetry).toBe(false);
      expect(result.shouldFallback).toBe(true);
    });

    it('should classify 429 errors', () => {
      const error = new Error('Request failed with status 429');
      const result = classifyError(error);

      expect(result.category).toBe('RATE_LIMIT');
    });

    it('should classify quota exceeded errors', () => {
      const error = new Error('Quota exceeded for this API key');
      const result = classifyError(error);

      expect(result.category).toBe('RATE_LIMIT');
    });
  });

  describe('AUTH errors', () => {
    it('should classify unauthorized errors', () => {
      const error = new Error('Unauthorized: Invalid API key');
      const result = classifyError(error);

      expect(result.category).toBe('AUTH');
      expect(result.shouldRetry).toBe(false);
      expect(result.shouldFallback).toBe(true);
    });

    it('should classify 401 errors', () => {
      const error = new Error('Request failed with status 401');
      const result = classifyError(error);

      expect(result.category).toBe('AUTH');
    });

    it('should classify 403 errors', () => {
      const error = new Error('Request failed with status 403 Forbidden');
      const result = classifyError(error);

      expect(result.category).toBe('AUTH');
    });
  });

  describe('TRANSIENT errors', () => {
    it('should classify timeout errors', () => {
      const error = new Error('Request timed out');
      const result = classifyError(error);

      expect(result.category).toBe('TRANSIENT');
      expect(result.shouldRetry).toBe(true);
      expect(result.shouldFallback).toBe(true);
    });

    it('should classify network errors', () => {
      const error = new Error('Network error: ECONNREFUSED');
      const result = classifyError(error);

      expect(result.category).toBe('TRANSIENT');
    });

    it('should classify 503 errors', () => {
      const error = new Error('Service unavailable (503)');
      const result = classifyError(error);

      expect(result.category).toBe('TRANSIENT');
    });
  });

  describe('INVALID_REQUEST errors', () => {
    it('should classify invalid request errors', () => {
      const error = new Error('Invalid request: missing prompt');
      const result = classifyError(error);

      expect(result.category).toBe('INVALID_REQUEST');
      expect(result.shouldRetry).toBe(false);
      expect(result.shouldFallback).toBe(false);
    });

    it('should classify 400 errors', () => {
      const error = new Error('Bad request (400)');
      const result = classifyError(error);

      expect(result.category).toBe('INVALID_REQUEST');
    });

    it('should classify context length errors', () => {
      const error = new Error('Context length exceeded maximum');
      const result = classifyError(error);

      expect(result.category).toBe('INVALID_REQUEST');
    });

    it('should classify content filter errors', () => {
      const error = new Error('Content filtered due to safety policy');
      const result = classifyError(error);

      expect(result.category).toBe('INVALID_REQUEST');
    });
  });

  describe('UNKNOWN errors', () => {
    it('should classify unknown errors as UNKNOWN', () => {
      const error = new Error('Something unexpected happened');
      const result = classifyError(error);

      expect(result.category).toBe('UNKNOWN');
      expect(result.shouldRetry).toBe(true);
      expect(result.shouldFallback).toBe(true);
    });
  });

  describe('error with status property', () => {
    it('should check status property for classification', () => {
      const error = new Error('API Error') as Error & { status: number };
      error.status = 429;
      const result = classifyError(error);

      expect(result.category).toBe('RATE_LIMIT');
    });
  });
});

describe('AllModelsFailedError', () => {
  it('should include all model names in message', () => {
    const attempts = [
      { modelName: 'model-1', error: new Error('Failed 1') },
      { modelName: 'model-2', error: new Error('Failed 2') },
    ];

    const error = new AllModelsFailedError(attempts);

    expect(error.message).toBe('All models failed: model-1, model-2');
    expect(error.name).toBe('AllModelsFailedError');
    expect(error.attempts).toEqual(attempts);
  });
});

describe('TimeoutError', () => {
  it('should include timeout duration in message', () => {
    const error = new TimeoutError(5000);

    expect(error.message).toBe('Request timed out after 5000ms');
    expect(error.name).toBe('TimeoutError');
  });
});
