import { z } from 'zod';

// Attribute value can be boolean, number, or string
export type AttributeValue = boolean | number | string;

// Model attributes schema
export const ModelAttributesSchema = z.record(
  z.string(),
  z.union([z.boolean(), z.number(), z.string()])
);

export type ModelAttributes = z.infer<typeof ModelAttributesSchema>;

/**
 * A model entry in the store/config.
 *
 * model-selector is match-only: it never creates clients, so client fields
 * (model_id, api_key, base_url) are optional and not used by the matcher — they
 * are retained so existing config files load unchanged and hosts can keep their
 * own connection details alongside the matchable attributes.
 */
export const ModelConfigSchema = z.object({
  provider: z.string().optional(),
  model_id: z.string().optional(),
  api_key: z.string().optional(),
  base_url: z.string().optional(),
  hf_repo_id: z.string().optional(),
  enabled: z.boolean().default(true),
  attributes: ModelAttributesSchema.default({}),
  provenance: z.record(z.string(), z.string()).optional(),
});

export type ModelConfig = z.infer<typeof ModelConfigSchema>;

// Alias definition: maps a name to a query expression
export const AliasesSchema = z.record(z.string(), z.string());
export type Aliases = z.infer<typeof AliasesSchema>;

// Full config file schema
export const ConfigSchema = z.object({
  aliases: AliasesSchema.default({}),
  models: z.record(z.string(), ModelConfigSchema),
});

export type Config = z.infer<typeof ConfigSchema>;

// Parsed query condition
export type ComparisonOperator = '=' | '!=' | '>' | '>=' | '<' | '<=';

export interface QueryCondition {
  attribute: string;
  operator: ComparisonOperator;
  value: AttributeValue;
  negated: boolean;
  weight: number; // Position-based weight (higher = more important)
}

export interface ParsedQuery {
  conditions: QueryCondition[];
}

/**
 * The result of selecting a model. model-selector hands back the host's own
 * model identifier plus match metadata — never an instantiated client.
 */
export interface Selection {
  /** The model's name/id in the config — what the host uses to make a client. */
  modelId: string;
  /** The full config entry (provider, attributes, ...). */
  config: ModelConfig;
  /** Normalized score in [0, 1]. */
  score: number;
  /** At least one condition matched. */
  matches: boolean;
  /** Every condition matched. */
  exactMatch: boolean;
  matchedAttributes: string[];
  missingAttributes: string[];
}

// Options for selection
export interface SelectOptions {
  count?: number;
  configPath?: string;
  /** When true, only return models with at least one matched condition. */
  requireMatch?: boolean;
}
