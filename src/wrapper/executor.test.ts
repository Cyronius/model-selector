import { describe, it, expect, vi } from 'vitest';
import { executeWithFallbacks } from './executor.js';
import type { ModelCandidate } from './types.js';
import { AllModelsFailedError } from './errors.js';

// Mock LanguageModel
const createMockModel = (id: string) =>
  ({
    modelId: id,
    provider: 'mock',
  }) as unknown as import('ai').LanguageModel;

// Mock ModelConfig
const createMockConfig = (provider: string) => ({
  provider,
  model_id: 'test-model',
  enabled: true,
  attributes: {},
});

describe('executeWithFallbacks', () => {
  it('should succeed on first try', async () => {
    const candidates: ModelCandidate[] = [
      {
        model: createMockModel('model-1'),
        config: createMockConfig('provider-1'),
        modelName: 'model-1',
        score: 1.0,
      },
    ];

    const fn = vi.fn().mockResolvedValue({ text: 'success' });

    const result = await executeWithFallbacks(candidates, fn);

    expect(result.result).toEqual({ text: 'success' });
    expect(result.modelUsed).toBe('model-1');
    expect(result.fallbacksUsed).toBe(0);
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]?.success).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should fallback to second model on first failure', async () => {
    const candidates: ModelCandidate[] = [
      {
        model: createMockModel('model-1'),
        config: createMockConfig('provider-1'),
        modelName: 'model-1',
        score: 1.0,
      },
      {
        model: createMockModel('model-2'),
        config: createMockConfig('provider-2'),
        modelName: 'model-2',
        score: 0.8,
      },
    ];

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({ text: 'success from model-2' });

    const result = await executeWithFallbacks(candidates, fn, {
      maxRetries: 0, // Disable retries for this test
    });

    expect(result.result).toEqual({ text: 'success from model-2' });
    expect(result.modelUsed).toBe('model-2');
    expect(result.fallbacksUsed).toBe(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw AllModelsFailedError when all models fail', async () => {
    const candidates: ModelCandidate[] = [
      {
        model: createMockModel('model-1'),
        config: createMockConfig('provider-1'),
        modelName: 'model-1',
        score: 1.0,
      },
      {
        model: createMockModel('model-2'),
        config: createMockConfig('provider-2'),
        modelName: 'model-2',
        score: 0.8,
      },
    ];

    const fn = vi.fn().mockRejectedValue(new Error('Always fails'));

    await expect(
      executeWithFallbacks(candidates, fn, { maxRetries: 0 })
    ).rejects.toThrow(AllModelsFailedError);
  });

  it('should respect fallbackCount option', async () => {
    const candidates: ModelCandidate[] = [
      {
        model: createMockModel('model-1'),
        config: createMockConfig('provider-1'),
        modelName: 'model-1',
        score: 1.0,
      },
      {
        model: createMockModel('model-2'),
        config: createMockConfig('provider-2'),
        modelName: 'model-2',
        score: 0.8,
      },
      {
        model: createMockModel('model-3'),
        config: createMockConfig('provider-3'),
        modelName: 'model-3',
        score: 0.6,
      },
    ];

    const fn = vi.fn().mockRejectedValue(new Error('Always fails'));

    await expect(
      executeWithFallbacks(candidates, fn, { fallbackCount: 2, maxRetries: 0 })
    ).rejects.toThrow(AllModelsFailedError);

    // Should only try 2 models due to fallbackCount
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should call hooks appropriately', async () => {
    const candidates: ModelCandidate[] = [
      {
        model: createMockModel('model-1'),
        config: createMockConfig('provider-1'),
        modelName: 'model-1',
        score: 1.0,
      },
      {
        model: createMockModel('model-2'),
        config: createMockConfig('provider-2'),
        modelName: 'model-2',
        score: 0.8,
      },
    ];

    const onAttempt = vi.fn();
    const onFallback = vi.fn();
    const onSuccess = vi.fn();

    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('First fails'))
      .mockResolvedValueOnce({ text: 'success' });

    await executeWithFallbacks(candidates, fn, {
      maxRetries: 0,
      hooks: { onAttempt, onFallback, onSuccess },
    });

    expect(onAttempt).toHaveBeenCalledTimes(2);
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(onFallback).toHaveBeenCalledWith(
      'model-1',
      'model-2',
      expect.any(Error)
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledWith({
      modelName: 'model-2',
      attempts: expect.any(Array),
    });
  });

  it('should throw immediately for invalid request errors', async () => {
    const candidates: ModelCandidate[] = [
      {
        model: createMockModel('model-1'),
        config: createMockConfig('provider-1'),
        modelName: 'model-1',
        score: 1.0,
      },
      {
        model: createMockModel('model-2'),
        config: createMockConfig('provider-2'),
        modelName: 'model-2',
        score: 0.8,
      },
    ];

    // Invalid request errors should not fallback
    const fn = vi.fn().mockRejectedValue(new Error('Invalid request: bad input'));

    await expect(
      executeWithFallbacks(candidates, fn, { maxRetries: 0 })
    ).rejects.toThrow('Invalid request');

    // Should only try first model, not fallback
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw error when no candidates provided', async () => {
    const fn = vi.fn().mockResolvedValue({ text: 'success' });

    await expect(executeWithFallbacks([], fn)).rejects.toThrow(
      'No models available to try'
    );
  });
});
