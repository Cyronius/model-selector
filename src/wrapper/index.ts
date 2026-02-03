/**
 * High-level Vercel AI SDK wrapper with automatic model selection and fallbacks.
 *
 * This module provides a complete LLM interface that wraps Vercel AI SDK functions
 * with query-based model selection and automatic fallback on failure.
 *
 * @example
 * ```typescript
 * import { generate, stream, generateObject } from 'model-selector';
 *
 * // Text generation with fallbacks
 * const result = await generate("fast, reliable", {
 *   prompt: "Explain quantum computing",
 *   fallbackCount: 3,
 * });
 *
 * // Streaming with fallbacks
 * for await (const chunk of stream("capable", { prompt: "Write a story" })) {
 *   process.stdout.write(chunk.text);
 * }
 *
 * // Structured output
 * const analysis = await generateObject("smart", {
 *   schema: z.object({ sentiment: z.string() }),
 *   prompt: "Analyze this review",
 * });
 * ```
 *
 * @module
 */

// Text generation
export { generate, stream } from './generate.js';

// Structured output
export { generateObject, streamObject } from './object.js';

// Embeddings
export { embed, embedMany } from './embed.js';

// Types
export type {
  // Base types
  AttemptInfo,
  WrapperHooks,
  BaseWrapperOptions,
  TokenUsage,

  // Text generation
  GenerateOptions,
  GenerateResult,
  StreamOptions,
  StreamChunk,
  StreamResult,

  // Structured output
  GenerateObjectOptions,
  ObjectResult,
  StreamObjectOptions,
  ObjectStreamResult,

  // Embeddings
  EmbedOptions,
  EmbedResult,
  EmbedManyOptions,
  EmbedManyResult,
} from './types.js';

// Errors
export { AllModelsFailedError, TimeoutError, classifyError } from './errors.js';
export type { ErrorCategory, ClassifiedError } from './errors.js';
