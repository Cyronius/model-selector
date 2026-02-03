import { generateObject as aiGenerateObject, streamObject as aiStreamObject } from 'ai';
import type { z } from 'zod';
import { selectModelsDetailed } from '../index.js';
import type {
  GenerateObjectOptions,
  ObjectResult,
  StreamObjectOptions,
  ObjectStreamResult,
  AttemptInfo,
  ModelCandidate,
} from './types.js';
import { executeWithFallbacks, resolveOptions } from './executor.js';
import { classifyError, AllModelsFailedError } from './errors.js';

/**
 * Generate a structured object with automatic model selection and fallbacks.
 *
 * @param query - Model selection query (e.g., "smart, structured")
 * @param options - Generation options including schema and Vercel AI SDK params
 * @returns Object result with fallback metadata
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const result = await generateObject("smart", {
 *   schema: z.object({
 *     summary: z.string(),
 *     sentiment: z.enum(["positive", "negative", "neutral"]),
 *     confidence: z.number().min(0).max(1),
 *   }),
 *   prompt: "Analyze this customer review: ...",
 * });
 *
 * console.log(result.object.sentiment);
 * ```
 */
export async function generateObject<T extends z.ZodType>(
  query: string,
  options: GenerateObjectOptions<T>
): Promise<ObjectResult<z.infer<T>>> {
  const resolved = resolveOptions(options);

  // Select and rank models
  const selections = await selectModelsDetailed(query, {
    count: resolved.fallbackCount,
    configPath: resolved.configPath,
  });

  const candidates: ModelCandidate[] = selections.map((s) => ({
    model: s.model,
    config: s.config,
    modelName: s.modelName,
    score: s.score,
  }));

  // Execute with fallbacks
  const executionResult = await executeWithFallbacks(
    candidates,
    async (model) => {
      const result = await aiGenerateObject({
        model,
        schema: options.schema,
        schemaName: options.schemaName,
        schemaDescription: options.schemaDescription,
        mode: options.mode,
        prompt: options.prompt,
        system: options.system,
        messages: options.messages,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        topP: options.topP,
        topK: options.topK,
        presencePenalty: options.presencePenalty,
        frequencyPenalty: options.frequencyPenalty,
        seed: options.seed,
        abortSignal: options.abortSignal,
        headers: options.headers,
      });

      return result;
    },
    options
  );

  return {
    object: executionResult.result.object,
    usage: {
      promptTokens: executionResult.result.usage.promptTokens,
      completionTokens: executionResult.result.usage.completionTokens,
      totalTokens: executionResult.result.usage.totalTokens,
    },
    finishReason: executionResult.result.finishReason,
    modelUsed: executionResult.modelUsed,
    modelConfig: executionResult.modelConfig,
    attempts: executionResult.attempts,
    fallbacksUsed: executionResult.fallbacksUsed,
  };
}

/**
 * Partial object chunk emitted during streaming.
 */
export interface ObjectStreamChunk<T> {
  partialObject: Partial<T>;
  modelName: string;
}

/**
 * Stream a structured object with automatic model selection and fallbacks.
 *
 * On mid-stream failure, automatically restarts from the beginning with the next fallback model.
 *
 * @param query - Model selection query (e.g., "smart, structured")
 * @param options - Stream options including schema and Vercel AI SDK params
 * @returns Async iterable of partial objects, with final result available
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const streamResult = streamObject("smart", {
 *   schema: z.object({
 *     chapters: z.array(z.object({
 *       title: z.string(),
 *       content: z.string(),
 *     })),
 *   }),
 *   prompt: "Write a short story with 3 chapters",
 * });
 *
 * for await (const chunk of streamResult) {
 *   console.log("Partial:", chunk.partialObject);
 * }
 *
 * const final = await streamResult.result;
 * console.log("Complete:", final.object);
 * ```
 */
export function streamObject<T extends z.ZodType>(
  query: string,
  options: StreamObjectOptions<T>
): AsyncIterable<ObjectStreamChunk<z.infer<T>>> & { result: Promise<ObjectStreamResult<z.infer<T>>> } {
  const resolved = resolveOptions(options);
  const attempts: AttemptInfo[] = [];
  const failedModels: Array<{ modelName: string; error: Error }> = [];

  let resolveResult: ((result: ObjectStreamResult<z.infer<T>>) => void) | undefined;
  let rejectResult: ((error: Error) => void) | undefined;

  const resultPromise = new Promise<ObjectStreamResult<z.infer<T>>>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  async function* generateStream(): AsyncGenerator<ObjectStreamChunk<z.infer<T>>> {
    // Select and rank models
    const selections = await selectModelsDetailed(query, {
      count: resolved.fallbackCount,
      configPath: resolved.configPath,
    });

    const candidates: ModelCandidate[] = selections.map((s) => ({
      model: s.model,
      config: s.config,
      modelName: s.modelName,
      score: s.score,
    }));

    if (candidates.length === 0) {
      const error = new Error('No models available');
      rejectResult?.(error);
      throw error;
    }

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (!candidate) continue;

      const { model, config, modelName } = candidate;
      const isRetry = i > 0;

      // Notify about model switch
      options.onModelSwitch?.(modelName, isRetry);

      // Notify hooks about fallback if not first model
      if (isRetry && failedModels.length > 0) {
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
        const streamResult = aiStreamObject({
          model,
          schema: options.schema,
          schemaName: options.schemaName,
          schemaDescription: options.schemaDescription,
          mode: options.mode,
          prompt: options.prompt,
          system: options.system,
          messages: options.messages,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          topP: options.topP,
          topK: options.topK,
          presencePenalty: options.presencePenalty,
          frequencyPenalty: options.frequencyPenalty,
          seed: options.seed,
          abortSignal: options.abortSignal,
          headers: options.headers,
        });

        // Stream partial objects
        for await (const partialObject of streamResult.partialObjectStream) {
          yield { partialObject, modelName };
        }

        // Get final result
        const usage = await streamResult.usage;
        const finalObject = await streamResult.object;
        // Note: streamObject doesn't have finishReason in all SDK versions
        const finishReason = 'stop' as const;

        attempts.push({
          modelName,
          provider: config.provider,
          success: true,
          durationMs: Date.now() - startTime,
        });

        const finalResult: ObjectStreamResult<z.infer<T>> = {
          object: finalObject,
          usage: {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
          },
          finishReason,
          modelUsed: modelName,
          modelConfig: config,
          attempts,
          fallbacksUsed: i,
        };

        resolved.hooks?.onSuccess?.({
          modelName,
          attempts,
        });

        resolveResult?.(finalResult);
        return;
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

        // If error says don't fallback, stop trying
        if (!classified.shouldFallback) {
          rejectResult?.(err);
          throw err;
        }

        // Continue to next model (discard partial output, restart)
      }
    }

    // All models failed
    const error = new AllModelsFailedError(failedModels);
    rejectResult?.(error);
    throw error;
  }

  const iterable = generateStream();

  return Object.assign(iterable, { result: resultPromise });
}
