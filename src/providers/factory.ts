import type { LanguageModel } from 'ai';
import { ModelConfig } from '../types.js';
import { getProviderInfo, getSupportedProviders } from './registry.js';

/**
 * Provider factory function type.
 * Creates a provider instance that can be called with a model ID.
 */
type ProviderFactory = (config: {
  apiKey?: string;
  baseURL?: string;
}) => (modelId: string) => LanguageModel;

/**
 * Cache for loaded provider factories.
 */
const factoryCache = new Map<string, ProviderFactory>();

/**
 * Dynamically import a provider factory.
 *
 * Uses dynamic import to support optional peer dependencies.
 * Caches the factory for subsequent calls.
 */
export async function getProviderFactory(providerName: string): Promise<ProviderFactory> {
  // Check cache first
  const cached = factoryCache.get(providerName);
  if (cached) {
    return cached;
  }

  const info = getProviderInfo(providerName);
  if (!info) {
    throw new Error(
      `Unknown provider: "${providerName}"\n` +
      `Supported providers: ${getSupportedProviders().join(', ')}`
    );
  }

  try {
    const module = await import(info.package);
    const factory = module[info.factory] as ProviderFactory;

    if (typeof factory !== 'function') {
      throw new Error(
        `Provider "${providerName}" does not export "${info.factory}" as a function`
      );
    }

    factoryCache.set(providerName, factory);
    return factory;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot find package')) {
      throw new Error(
        `Provider "${providerName}" not installed.\n` +
        `Run: npm install ${info.package}`
      );
    }
    throw error;
  }
}

/**
 * Create a LanguageModel from a model configuration.
 *
 * Dynamically loads the appropriate provider and creates the model instance.
 */
export async function createLanguageModel(config: ModelConfig): Promise<LanguageModel> {
  const factory = await getProviderFactory(config.provider);

  const providerConfig: { apiKey?: string; baseURL?: string } = {};

  if (config.api_key) {
    providerConfig.apiKey = config.api_key;
  }
  if (config.base_url) {
    providerConfig.baseURL = config.base_url;
  }

  const provider = factory(providerConfig);
  return provider(config.model_id);
}
