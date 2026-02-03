import { generateText, streamText, type LanguageModel } from 'ai';
import { selectModelsDetailed } from '../index.js';
import type { ModelConfig } from '../types.js';
import type {
  GenerateOptions,
  GenerateResult,
  StreamOptions,
  StreamChunk,
  StreamResult,
  AttemptInfo,
  ModelCandidate,
} from './types.js';
import { executeWithFallbacks, resolveOptions } from './executor.js';
import { classifyError, AllModelsFailedError } from './errors.js';

/**
 * Generate text with automatic model selection and fallbacks.
 *
 * @param query - Model selection query (e.g., "fast, cheap, functions")
 * @param options - Generation options including Vercel AI SDK params
 * @returns Generation result with fallback metadata
 *
 * @example
 * ```typescript
 * const result = await generate("fast, reliable", {
 *   prompt: "Explain quantum computing",
 *   fallbackCount: 3,
 * });
 * console.log(result.text);
 * console.log(`Used model: ${result.modelUsed}`);
 * ```
 */
export async function generate(
  query: string,
  options: GenerateOptions = {}
): Promise<GenerateResult> {
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
      const result = await generateText({
        model,
        prompt: options.prompt,
        system: options.system,
        messages: options.messages,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        topP: options.topP,
        topK: options.topK,
        presencePenalty: options.presencePenalty,
        frequencyPenalty: options.frequencyPenalty,
        stopSequences: options.stopSequences,
        seed: options.seed,
        abortSignal: options.abortSignal,
        headers: options.headers,
      });

      return result;
    },
    options
  );

  return {
    text: executionResult.result.text,
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
 * Stream text with automatic model selection and fallbacks.
 *
 * On mid-stream failure, automatically restarts from the beginning with the next fallback model.
 *
 * @param query - Model selection query (e.g., "fast, capable")
 * @param options - Stream options including Vercel AI SDK params
 * @returns Async iterable of stream chunks, with final result available
 *
 * @example
 * ```typescript
 * const streamResult = stream("capable", { prompt: "Write a story" });
 *
 * for await (const chunk of streamResult) {
 *   process.stdout.write(chunk.text);
 * }
 *
 * const final = await streamResult.result;
 * console.log(`\nUsed model: ${final.modelUsed}`);
 * ```
 */
export function stream(
  query: string,
  options: StreamOptions = {}
): AsyncIterable<StreamChunk> & { result: Promise<StreamResult> } {
  const resolved = resolveOptions(options);
  const attempts: AttemptInfo[] = [];
  const failedModels: Array<{ modelName: string; error: Error }> = [];

  let finalResult: StreamResult | undefined;
  let resolveResult: ((result: StreamResult) => void) | undefined;
  let rejectResult: ((error: Error) => void) | undefined;

  const resultPromise = new Promise<StreamResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  async function* generateStream(): AsyncGenerator<StreamChunk> {
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
        const streamResult = streamText({
          model,
          prompt: options.prompt,
          system: options.system,
          messages: options.messages,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          topP: options.topP,
          topK: options.topK,
          presencePenalty: options.presencePenalty,
          frequencyPenalty: options.frequencyPenalty,
          stopSequences: options.stopSequences,
          seed: options.seed,
          abortSignal: options.abortSignal,
          headers: options.headers,
        });

        // Stream chunks
        for await (const chunk of streamResult.textStream) {
          yield { text: chunk, modelName };
        }

        // Get final result
        const usage = await streamResult.usage;
        const finishReason = await streamResult.finishReason;
        const fullText = await streamResult.text;

        attempts.push({
          modelName,
          provider: config.provider,
          success: true,
          durationMs: Date.now() - startTime,
        });

        finalResult = {
          text: fullText,
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
