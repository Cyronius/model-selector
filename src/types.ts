import { z } from 'zod';

// Attribute value can be boolean, number, or string
export type AttributeValue = boolean | number | string;

// Model attributes schema
export const ModelAttributesSchema = z.record(
  z.string(),
  z.union([z.boolean(), z.number(), z.string()])
);

export type ModelAttributes = z.infer<typeof ModelAttributesSchema>;

// Individual model configuration schema
export const ModelConfigSchema = z.object({
  provider: z.string(),
  model_id: z.string(),
  api_key: z.string().optional(),
  base_url: z.string().optional(),
  enabled: z.boolean().default(true),
  attributes: ModelAttributesSchema.default({}),
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

// Selection result
export interface SelectionResult<T> {
  model: T;
  config: ModelConfig;
  modelName: string;
  score: number;
  exactMatch: boolean;
  matchedAttributes: string[];
  missingAttributes: string[];
}

// Options for selection
export interface SelectOptions {
  detailed?: boolean;
  count?: number;
  configPath?: string;
}
