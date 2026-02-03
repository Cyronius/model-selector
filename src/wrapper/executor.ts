import type { LanguageModel } from 'ai';
import type { ModelConfig } from '../types.js';
import type { AttemptInfo, BaseWrapperOptions, ModelCandidate, WrapperHooks } from './types.js';
import { classifyError, AllModelsFailedError, TimeoutError } from './errors.js';

const DEFAULT_FALLBACK_COUNT = 3;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY = 1000;
const DEFAULT_TIMEOUT = 60000;

export interface ExecutionResult<T> {
  result: T;
  modelUsed: string;
  modelConfig: ModelConfig;
  attempts: AttemptInfo[];
  fallbacksUsed: number;
}

interface ExecutorOptions {
  maxRetries: number;
  retryDelay: number;
  timeout: number;
  hooks?: WrapperHooks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a timeout wrapper for a promise.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(timeoutMs));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Execute a function with retry logic for a single model.
 */
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: ExecutorOptions,
  modelName: string,
  provider: string
): Promise<{ result: T; attempts: AttemptInfo[] }> {
  const attempts: AttemptInfo[] = [];
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    const startTime = Date.now();

    options.hooks?.onAttempt?.({
      modelName,
      provider,
      attemptNumber: attempt + 1,
    });

    try {
      const result = await withTimeout(fn(), options.timeout);
      attempts.push({
        modelName,
        provider,
        success: true,
        durationMs: Date.now() - startTime,
      });
      return { result, attempts };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const classified = classifyError(err);

      attempts.push({
        modelName,
        provider,
        success: false,
        error: err,
        durationMs: Date.now() - startTime,
      });

      lastError = err;

      // Don't retry if error classification says not to
      if (!classified.shouldRetry) {
        break;
      }

      // Don't retry on last attempt
      if (attempt < options.maxRetries) {
        // Exponential backoff
        const delay = options.retryDelay * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('Unknown error');
}

/**
 * Execute a function across multiple models with automatic fallback.
 *
 * @param candidates - Ranked list of model candidates (best first)
 * @param fn - Function to execute with each model
 * @param options - Wrapper options
 * @returns Execution result with metadata
 */
export async function executeWithFallbacks<T>(
  candidates: ModelCandidate[],
  fn: (model: LanguageModel, config: ModelConfig, modelName: string) => Promise<T>,
  options: BaseWrapperOptions = {}
): Promise<ExecutionResult<T>> {
  const fallbackCount = options.fallbackCount ?? DEFAULT_FALLBACK_COUNT;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  const modelsToTry = candidates.slice(0, fallbackCount);

  if (modelsToTry.length === 0) {
    throw new Error('No models available to try');
  }

  const allAttempts: AttemptInfo[] = [];
  const failedModels: Array<{ modelName: string; error: Error }> = [];

  for (let i = 0; i < modelsToTry.length; i++) {
    const candidate = modelsToTry[i];
    if (!candidate) continue;

    const { model, config, modelName } = candidate;

    // Notify hooks about fallback if not first model
    if (i > 0 && failedModels.length > 0) {
      const lastFailure = failedModels[failedModels.length - 1];
      if (lastFailure) {
        options.hooks?.onFallback?.(lastFailure.modelName, modelName, lastFailure.error);
      }
    }

    try {
      const { result, attempts } = await executeWithRetry(
        () => fn(model, config, modelName),
        { maxRetries, retryDelay, timeout, hooks: options.hooks },
        modelName,
        config.provider
      );

      allAttempts.push(...attempts);

      options.hooks?.onSuccess?.({
        modelName,
        attempts: allAttempts,
      });

      return {
        result,
        modelUsed: modelName,
        modelConfig: config,
        attempts: allAttempts,
        fallbacksUsed: i,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const classified = classifyError(err);

      // Record the failed model
      failedModels.push({ modelName, error: err });

      // If error says don't fallback, stop trying
      if (!classified.shouldFallback) {
        throw err;
      }

      // Continue to next model
    }
  }

  // All models failed
  throw new AllModelsFailedError(failedModels);
}

/**
 * Resolve options with defaults.
 */
export function resolveOptions(options: BaseWrapperOptions = {}): {
  fallbackCount: number;
  maxRetries: number;
  retryDelay: number;
  timeout: number;
  configPath?: string;
  hooks?: WrapperHooks;
} {
  return {
    fallbackCount: options.fallbackCount ?? DEFAULT_FALLBACK_COUNT,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    retryDelay: options.retryDelay ?? DEFAULT_RETRY_DELAY,
    timeout: options.timeout ?? DEFAULT_TIMEOUT,
    configPath: options.configPath,
    hooks: options.hooks,
  };
}
