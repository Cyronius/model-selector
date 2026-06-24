import { loadConfig, getEnabledModels } from './config/loader.js';
import { parseQuery } from './query/parser.js';
import { matchModel, normalizeScore } from './query/matcher.js';
import { Config, ModelConfig, Selection, SelectOptions } from './types.js';

// Re-export types
export type {
  Config,
  ModelConfig,
  Selection,
  SelectOptions,
  AttributeValue,
  ModelAttributes,
  Aliases,
  QueryCondition,
  ParsedQuery,
} from './types.js';

// Re-export query utilities
export { parseQuery } from './query/parser.js';
export { matchModel, normalizeScore } from './query/matcher.js';
export type { MatchResult } from './query/matcher.js';

// Config loader / store exports
export { loadConfig, getEnabledModels } from './config/loader.js';

// Config writer exports
export {
  writeConfig,
  updateConfig,
  addModel,
  updateModel,
  removeModel,
  setModelEnabled,
  setAlias,
  removeAlias,
  getDefaultConfigPath,
  ensureConfigDirectory,
  validateModelConfig,
  validateConfig,
} from './config/writer.js';

export type { ConfigWriterOptions, WriteResult } from './config/writer.js';
export { ConfigError, ConfigErrorCode } from './config/errors.js';

/**
 * Fold the top-level provider into the matchable attributes so `provider = ...`
 * queries work without the host duplicating the field in `attributes`.
 */
function effectiveAttributes(config: ModelConfig): ModelConfig['attributes'] {
  if (!config.provider || 'provider' in config.attributes) {
    return config.attributes;
  }
  return { ...config.attributes, provider: config.provider };
}

/**
 * Rank enabled models in a config against a query, best (highest normalized
 * score) first. The sort is stable, so equal scores keep config order.
 *
 * Returns the host's own model ids wrapped in match metadata — no clients.
 */
export function rankModels(query: string, config: Config): Selection[] {
  const parsedQuery = parseQuery(query, config.aliases);
  const enabledModels = getEnabledModels(config);

  const ranked: Selection[] = enabledModels.map(({ name, config: modelConfig }) => {
    const matchResult = matchModel(effectiveAttributes(modelConfig), parsedQuery);
    return {
      modelId: name,
      config: modelConfig,
      score: normalizeScore(matchResult),
      matches: matchResult.matches,
      exactMatch: matchResult.exactMatch,
      matchedAttributes: matchResult.matchedAttributes,
      missingAttributes: matchResult.missingAttributes,
    };
  });

  // Stable sort by normalized score, descending.
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

/**
 * Select the single best matching model for a query.
 *
 * Returns the host's model id + match metadata, or `null` when no model is
 * available (or, with `requireMatch`, when nothing matched). Client creation
 * stays the host's job.
 *
 * @example
 * ```typescript
 * const sel = selectModel('fast, cheap, functions');
 * if (sel) const client = hostMakeClient(sel.modelId);
 * ```
 */
export function selectModel(query: string, options: SelectOptions = {}): Selection | null {
  const config = loadConfig(options.configPath);
  const ranked = rankModels(query, config);
  const best = ranked[0];
  if (!best) return null;
  if (options.requireMatch && !best.matches) return null;
  return best;
}

/**
 * Select multiple models ranked by query match, for fallback scenarios.
 *
 * @example
 * ```typescript
 * for (const sel of selectModels('local, reasoning', { count: 3 })) {
 *   try { return await hostGenerate(sel.modelId, prompt); } catch { continue; }
 * }
 * ```
 */
export function selectModels(query: string, options: SelectOptions = {}): Selection[] {
  const config = loadConfig(options.configPath);
  let ranked = rankModels(query, config);
  if (options.requireMatch) {
    ranked = ranked.filter((r) => r.matches);
  }
  const count = options.count ?? ranked.length;
  return ranked.slice(0, count);
}
