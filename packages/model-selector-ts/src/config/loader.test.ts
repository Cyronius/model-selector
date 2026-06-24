import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveEnvVars } from './loader.js';

describe('resolveEnvVars', () => {
  beforeEach(() => {
    vi.stubEnv('TEST_API_KEY', 'test-key-123');
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai-xxx');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves $VAR syntax', () => {
    expect(resolveEnvVars('$TEST_API_KEY')).toBe('test-key-123');
  });

  it('resolves ${VAR} syntax', () => {
    expect(resolveEnvVars('${TEST_API_KEY}')).toBe('test-key-123');
  });

  it('resolves multiple env vars', () => {
    expect(resolveEnvVars('Key: $TEST_API_KEY, OpenAI: $OPENAI_API_KEY'))
      .toBe('Key: test-key-123, OpenAI: sk-openai-xxx');
  });

  it('returns empty string for missing env var', () => {
    expect(resolveEnvVars('$NONEXISTENT_VAR')).toBe('');
  });

  it('preserves text without env vars', () => {
    expect(resolveEnvVars('just plain text')).toBe('just plain text');
  });

  it('handles mixed content', () => {
    expect(resolveEnvVars('Bearer $TEST_API_KEY extra'))
      .toBe('Bearer test-key-123 extra');
  });
});
