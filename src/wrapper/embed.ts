import { embed as aiEmbed, embedMany as aiEmbedMany, type EmbeddingModel } from 'ai';
import { loadConfig, getEnabledModels } from '../config/loader.js';
import { parseQuery } from '../query/parser.js';
import { matchModel, normalizeScore } from '../query/matcher.js';
import { createEmbeddingModel } from '../providers/factory.js';
import type { ModelConfig } from '../types.js';
import type {
  EmbedOptions,
  EmbedResult,
  EmbedManyOptions,
  EmbedManyResult,
  AttemptInfo,
  EmbeddingCandidate,
} from './types.js';
import { resolveOptions } from './executor.js';
import { classifyError, AllModelsFailedError } from './errors.js';

/**
 * Select embedding models ranked by query match.
 * Creates EmbeddingModel instances instead of LanguageModel.
 */
async function selectEmbeddingModels(
  query: string,
  count: number,
  configPath?: string
): Promise<EmbeddingCandidate[]> {
  const config = loadConfig(configPath);
  const parsedQuery = parseQuery(query, config.aliases);
  const enabledModels = getEnabledModels(config);

  if (enabledModels.length === 0) {
    throw new Error('No models configured or all models are disabled');
  }

  // Rank models
  const ranked = enabledModels.map(({ name, config: modelConfig }) => {
    const matchResult = matchModel(modelConfig.attributes, parsedQuery);
    return {
      name,
      config: modelConfig,
      normalizedScore: normalizeScore(matchResult),
    };
  });

  ranked.sort((a, b) => b.normalizedScore - a.normalizedScore);
  const selected = ranked.slice(0, count);

  // Create embedding models
  const candidates: EmbeddingCandidate[] = [];
  for (const r of selected) {
    try {
      const model = await createEmbeddingModel(r.config);
      candidates.push({
        model,
        config: r.config,
        modelName: r.name,
        score: r.normalizedScore,
      });
    } catch {
      // Skip models that don't support embeddings
      continue;
    }
  }

  return candidates;
}

/**
 * Embed a single value with automatic model selection and fallbacks.
 *
 * @param query - Model selection query (e.g., "embedding")
 * @param options - Embed options
 * @returns Embedding result with fallback metadata
 *
 * @example
 * ```typescript
 * const result = await embed("embedding", {
 *   value: "Hello, world!",
 * });
 * console.log(result.embedding); // number[]
 * ```
 */
export async function embed(
  query: string,
  options: EmbedOptions
): Promise<EmbedResult> {
  const resolved = resolveOptions(options);

  const candidates = await selectEmbeddingModels(
    query,
    resolved.fallbackCount,
    resolved.configPath
  );

  if (candidates.length === 0) {
    throw new Error('No embedding-capable models available');
  }

  const attempts: AttemptInfo[] = [];
  const failedModels: Array<{ modelName: string; error: Error }> = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!candidate) continue;

    const { model, config, modelName } = candidate;

    // Notify hooks about fallback if not first model
    if (i > 0 && failedModels.length > 0) {
      const lastFailure = failedModels[failedModels.length - 1];
      if (lastFailure) {
        resolved.hooks?.onFallback?.(lastFailure.modelName, modelName, lastFailure.error);
      }
    }

    const startTime = Date.now();

    resolved.hooks?.onAttempt?.({
      modelName,
      provider: config.provider,
      attemptNumber: i + 1,
    });

    try {
      const result = await aiEmbed({
        model,
        value: options.value,
        abortSignal: options.abortSignal,
        headers: options.headers,
      });

      attempts.push({
        modelName,
        provider: config.provider,
        success: true,
        durationMs: Date.now() - startTime,
      });

      resolved.hooks?.onSuccess?.({
        modelName,
        attempts,
      });

      return {
        embedding: result.embedding,
        usage: result.usage,
        modelUsed: modelName,
        modelConfig: config,
        attempts,
        fallbacksUsed: i,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const classified = classifyError(err);

      attempts.push({
        modelName,
        provider: config.provider,
        success: false,
        error: err,
        durationMs: Date.now() - startTime,
      });

      failedModels.push({ modelName, error: err });

      if (!classified.shouldFallback) {
        throw err;
      }
    }
  }

  throw new AllModelsFailedError(failedModels);
}

/**
 * Embed multiple values with automatic model selection and fallbacks.
 *
 * @param query - Model selection query (e.g., "embedding")
 * @param options - Embed options
 * @returns Embeddings result with fallback metadata
 *
 * @example
 * ```typescript
 * const result = await embedMany("embedding", {
 *   values: ["Hello", "World", "!"],
 * });
 * console.log(result.embeddings); // number[][]
 * ```
 */
export async function embedMany(
  query: string,
  options: EmbedManyOptions
): Promise<EmbedManyResult> {
  const resolved = resolveOptions(options);

  const candidates = await selectEmbeddingModels(
    query,
    resolved.fallbackCount,
    resolved.configPath
  );

  if (candidates.length === 0) {
    throw new Error('No embedding-capable models available');
  }

  const attempts: AttemptInfo[] = [];
  const failedModels: Array<{ modelName: string; error: Error }> = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!candidate) continue;

    const { model, config, modelName } = candidate;

    // Notify hooks about fallback if not first model
    if (i > 0 && failedModels.length > 0) {
      const lastFailure = failedModels[failedModels.length - 1];
      if (lastFailure) {
        resolved.hooks?.onFallback?.(lastFailure.modelName, modelName, lastFailure.error);
      }
    }

    const startTime = Date.now();

    resolved.hooks?.onAttempt?.({
      modelName,
      provider: config.provider,
      attemptNumber: i + 1,
    });

    try {
      const result = await aiEmbedMany({
        model,
        values: options.values,
        abortSignal: options.abortSignal,
        headers: options.headers,
      });

      attempts.push({
        modelName,
        provider: config.provider,
        success: true,
        durationMs: Date.now() - startTime,
      });

      resolved.hooks?.onSuccess?.({
        modelName,
        attempts,
      });

      return {
        embeddings: result.embeddings,
        usage: result.usage,
        modelUsed: modelName,
        modelConfig: config,
        attempts,
        fallbacksUsed: i,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const classified = classifyError(err);

      attempts.push({
        modelName,
        provider: config.provider,
        success: false,
        error: err,
        durationMs: Date.now() - startTime,
      });

      failedModels.push({ modelName, error: err });

      if (!classified.shouldFallback) {
        throw err;
      }
    }
  }

  throw new AllModelsFailedError(failedModels);
}
