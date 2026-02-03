import type { LanguageModel, CoreMessage, EmbeddingModel } from 'ai';
import type { z } from 'zod';
import type { ModelConfig } from '../types.js';

// ============================================================================
// Attempt Tracking
// ============================================================================

export interface AttemptInfo {
  modelName: string;
  provider: string;
  success: boolean;
  error?: Error;
  durationMs: number;
}

// ============================================================================
// Hooks for Observability
// ============================================================================

export interface WrapperHooks {
  /** Called before each model attempt */
  onAttempt?: (info: { modelName: string; provider: string; attemptNumber: number }) => void;
  /** Called when falling back to another model */
  onFallback?: (from: string, to: string, error: Error) => void;
  /** Called when a request succeeds */
  onSuccess?: (info: { modelName: string; attempts: AttemptInfo[] }) => void;
}

// ============================================================================
// Base Options (shared across all wrapper functions)
// ============================================================================

export interface BaseWrapperOptions {
  /** How many fallback models to try (default: 3) */
  fallbackCount?: number;
  /** Custom config path */
  configPath?: string;
  /** Max retries per model for transient errors (default: 2) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  retryDelay?: number;
  /** Request timeout in ms (default: 60000) */
  timeout?: number;
  /** Observability hooks */
  hooks?: WrapperHooks;
}

// ============================================================================
// Text Generation Types
// ============================================================================

export interface GenerateOptions extends BaseWrapperOptions {
  // Vercel AI SDK options
  prompt?: string;
  system?: string;
  messages?: CoreMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stopSequences?: string[];
  seed?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GenerateResult {
  // Vercel AI SDK result fields
  text: string;
  usage: TokenUsage;
  finishReason: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other' | 'unknown';

  // Fallback metadata
  modelUsed: string;
  modelConfig: ModelConfig;
  attempts: AttemptInfo[];
  fallbacksUsed: number;
}

// ============================================================================
// Streaming Types
// ============================================================================

export interface StreamOptions extends BaseWrapperOptions {
  // Vercel AI SDK options
  prompt?: string;
  system?: string;
  messages?: CoreMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stopSequences?: string[];
  seed?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;

  /** Called when streaming starts with a new model (useful for UI updates) */
  onModelSwitch?: (modelName: string, isRetry: boolean) => void;
}

export interface StreamChunk {
  text: string;
  /** The model currently streaming */
  modelName: string;
}

export interface StreamResult {
  // Final result after stream completes
  text: string;
  usage: TokenUsage;
  finishReason: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other' | 'unknown';

  // Fallback metadata
  modelUsed: string;
  modelConfig: ModelConfig;
  attempts: AttemptInfo[];
  fallbacksUsed: number;
}

// ============================================================================
// Structured Output Types
// ============================================================================

export interface GenerateObjectOptions<T extends z.ZodType> extends BaseWrapperOptions {
  // Schema for structured output
  schema: T;
  schemaName?: string;
  schemaDescription?: string;
  mode?: 'auto' | 'json' | 'tool';

  // Vercel AI SDK options
  prompt?: string;
  system?: string;
  messages?: CoreMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface ObjectResult<T> {
  // Vercel AI SDK result fields
  object: T;
  usage: TokenUsage;
  finishReason: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other' | 'unknown';

  // Fallback metadata
  modelUsed: string;
  modelConfig: ModelConfig;
  attempts: AttemptInfo[];
  fallbacksUsed: number;
}

export interface StreamObjectOptions<T extends z.ZodType> extends BaseWrapperOptions {
  // Schema for structured output
  schema: T;
  schemaName?: string;
  schemaDescription?: string;
  mode?: 'auto' | 'json' | 'tool';

  // Vercel AI SDK options
  prompt?: string;
  system?: string;
  messages?: CoreMessage[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;

  /** Called when streaming starts with a new model */
  onModelSwitch?: (modelName: string, isRetry: boolean) => void;
}

export interface ObjectStreamResult<T> {
  // Final result after stream completes
  object: T;
  usage: TokenUsage;
  finishReason: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other' | 'unknown';

  // Fallback metadata
  modelUsed: string;
  modelConfig: ModelConfig;
  attempts: AttemptInfo[];
  fallbacksUsed: number;
}

// ============================================================================
// Embedding Types
// ============================================================================

export interface EmbedOptions extends BaseWrapperOptions {
  value: string;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface EmbedResult {
  embedding: number[];
  usage: { tokens: number };

  // Fallback metadata
  modelUsed: string;
  modelConfig: ModelConfig;
  attempts: AttemptInfo[];
  fallbacksUsed: number;
}

export interface EmbedManyOptions extends BaseWrapperOptions {
  values: string[];
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface EmbedManyResult {
  embeddings: number[][];
  usage: { tokens: number };

  // Fallback metadata
  modelUsed: string;
  modelConfig: ModelConfig;
  attempts: AttemptInfo[];
  fallbacksUsed: number;
}

// ============================================================================
// Internal Types
// ============================================================================

export interface ModelCandidate {
  model: LanguageModel;
  config: ModelConfig;
  modelName: string;
  score: number;
}

export interface EmbeddingCandidate {
  model: EmbeddingModel<string>;
  config: ModelConfig;
  modelName: string;
  score: number;
}

export interface ExecutionContext {
  attempts: AttemptInfo[];
  fallbacksUsed: number;
  startTime: number;
}
