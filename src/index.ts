import type { LanguageModel } from 'ai';
import { loadConfig, getEnabledModels } from './config/loader.js';
import { parseQuery } from './query/parser.js';
import { matchModel, normalizeScore, MatchResult } from './query/matcher.js';
import { createLanguageModel } from './providers/factory.js';
import { Config, ModelConfig, SelectionResult, SelectOptions } from './types.js';

// Re-export types
export type {
  Config,
  ModelConfig,
  SelectionResult,
  SelectOptions,
  AttributeValue,
  ModelAttributes,
  Aliases,
} from './types.js';

// Re-export utilities
export { loadConfig } from './config/loader.js';
export { parseQuery } from './query/parser.js';
export { matchModel } from './query/matcher.js';
export { getSupportedProviders, isProviderSupported } from './providers/registry.js';

/**
 * Internal: rank models by query match.
 */
interface RankedModel {
  name: string;
  config: ModelConfig;
  matchResult: MatchResult;
  normalizedScore: number;
}

function rankModels(query: string, config: Config): RankedModel[] {
  const parsedQuery = parseQuery(query, config.aliases);
  const enabledModels = getEnabledModels(config);

  if (enabledModels.length === 0) {
    throw new Error('No models configured or all models are disabled');
  }

  const ranked: RankedModel[] = enabledModels.map(({ name, config: modelConfig }) => {
    const matchResult = matchModel(modelConfig.attributes, parsedQuery);
    return {
      name,
      config: modelConfig,
      matchResult,
      normalizedScore: normalizeScore(matchResult),
    };
  });

  // Sort by score (descending)
  ranked.sort((a, b) => b.normalizedScore - a.normalizedScore);

  return ranked;
}

/**
 * Select the best matching model for a query.
 *
 * @param query - Query string (e.g., "fast, cheap, functions")
 * @param options - Selection options
 * @returns A ready-to-use LanguageModel, or SelectionResult if detailed=true
 *
 * @example
 * ```typescript
 * // Simple usage
 * const model = await selectModel("fast, cheap");
 * const { text } = await generateText({ model, prompt: 'Hello!' });
 *
 * // With detailed result
 * const result = await selectModel("local, functions", { detailed: true });
 * console.log(result.exactMatch, result.score);
 * ```
 */
export async function selectModel(
  query: string,
  options?: SelectOptions & { detailed?: false }
): Promise<LanguageModel>;
export async function selectModel(
  query: string,
  options: SelectOptions & { detailed: true }
): Promise<SelectionResult<LanguageModel>>;
export async function selectModel(
  query: string,
  options: SelectOptions = {}
): Promise<LanguageModel | SelectionResult<LanguageModel>> {
  const config = loadConfig(options.configPath);
  const ranked = rankModels(query, config);

  const best = ranked[0];
  if (!best) {
    throw new Error('No models available');
  }

  const languageModel = await createLanguageModel(best.config);

  if (options.detailed) {
    return {
      model: languageModel,
      config: best.config,
      modelName: best.name,
      score: best.normalizedScore,
      exactMatch: best.matchResult.exactMatch,
      matchedAttributes: best.matchResult.matchedAttributes,
      missingAttributes: best.matchResult.missingAttributes,
    };
  }

  return languageModel;
}

/**
 * Select multiple models ranked by query match.
 *
 * Useful for fallback scenarios where you want to try multiple models.
 *
 * @param query - Query string (e.g., "local, reasoning")
 * @param options - Selection options including count
 * @returns Array of LanguageModels, ordered by match score (best first)
 *
 * @example
 * ```typescript
 * const models = await selectModels("local, reasoning", { count: 3 });
 * for (const model of models) {
 *   try {
 *     const { text } = await generateText({ model, prompt: 'Hello!' });
 *     return text; // Success, stop trying
 *   } catch (e) {
 *     continue; // Try next model
 *   }
 * }
 * ```
 */
export async function selectModels(
  query: string,
  options: SelectOptions = {}
): Promise<LanguageModel[]> {
  const config = loadConfig(options.configPath);
  const ranked = rankModels(query, config);

  const count = options.count ?? ranked.length;
  const selected = ranked.slice(0, count);

  const models = await Promise.all(
    selected.map((r) => createLanguageModel(r.config))
  );

  return models;
}

/**
 * Select multiple models with detailed results.
 *
 * @param query - Query string
 * @param options - Selection options including count
 * @returns Array of SelectionResults, ordered by score
 */
export async function selectModelsDetailed(
  query: string,
  options: SelectOptions = {}
): Promise<SelectionResult<LanguageModel>[]> {
  const config = loadConfig(options.configPath);
  const ranked = rankModels(query, config);

  const count = options.count ?? ranked.length;
  const selected = ranked.slice(0, count);

  const results = await Promise.all(
    selected.map(async (r) => {
      const model = await createLanguageModel(r.config);
      return {
        model,
        config: r.config,
        modelName: r.name,
        score: r.normalizedScore,
        exactMatch: r.matchResult.exactMatch,
        matchedAttributes: r.matchResult.matchedAttributes,
        missingAttributes: r.matchResult.missingAttributes,
      };
    })
  );

  return results;
}
