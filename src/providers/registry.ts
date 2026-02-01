/**
 * Provider package metadata for dynamic imports.
 */
export interface ProviderInfo {
  package: string;
  factory: string;
}

/**
 * Registry of supported providers.
 *
 * Maps provider names to their npm package and factory function.
 */
export const providerPackages: Record<string, ProviderInfo> = {
  // Official @ai-sdk providers
  openai: { package: '@ai-sdk/openai', factory: 'createOpenAI' },
  anthropic: { package: '@ai-sdk/anthropic', factory: 'createAnthropic' },
  google: { package: '@ai-sdk/google', factory: 'createGoogleGenerativeAI' },
  mistral: { package: '@ai-sdk/mistral', factory: 'createMistral' },
  groq: { package: '@ai-sdk/groq', factory: 'createGroq' },
  cohere: { package: '@ai-sdk/cohere', factory: 'createCohere' },
  azure: { package: '@ai-sdk/azure', factory: 'createAzure' },

  // Community providers
  ollama: { package: 'ollama-ai-provider', factory: 'createOllama' },
};

/**
 * Get provider info by name.
 */
export function getProviderInfo(providerName: string): ProviderInfo | undefined {
  return providerPackages[providerName];
}

/**
 * Check if a provider is supported.
 */
export function isProviderSupported(providerName: string): boolean {
  return providerName in providerPackages;
}

/**
 * Get list of all supported provider names.
 */
export function getSupportedProviders(): string[] {
  return Object.keys(providerPackages);
}
