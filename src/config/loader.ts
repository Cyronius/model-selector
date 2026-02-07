import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parse as parseToml } from 'smol-toml';
import { Config, ConfigSchema, ModelConfig } from '../types.js';

/**
 * Get default config file locations (searched in order).
 * This is a function rather than a constant to defer os.homedir() evaluation,
 * allowing browser code to import this module without crashing.
 */
function getConfigLocations(): string[] {
  return [
    // User-level defaults
    path.join(os.homedir(), '.config', 'model-selector', 'config.toml'),
    // Project-specific overrides
    path.join(process.cwd(), 'model-selector.toml'),
  ];
}

/**
 * Find the first existing config file path.
 * Returns null if no config file exists.
 */
export function findExistingConfigPath(customPath?: string): string | null {
  const searchPaths = getConfigLocations();

  const envPath = process.env['MODEL_SELECTOR_CONFIG'];
  if (envPath) searchPaths.push(envPath);
  if (customPath) searchPaths.push(customPath);

  for (const configPath of searchPaths) {
    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }
  return null;
}

/**
 * Resolve environment variable references in a string.
 * Supports $VAR and ${VAR} syntax.
 */
export function resolveEnvVars(value: string): string {
  return value.replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/gi, (match, varName: string) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      // Return empty string if env var not found (don't fail)
      return '';
    }
    return envValue;
  });
}

/**
 * Process a model config, resolving env vars in api_key and base_url.
 */
function processModelConfig(config: ModelConfig): ModelConfig {
  return {
    ...config,
    api_key: config.api_key ? resolveEnvVars(config.api_key) : undefined,
    base_url: config.base_url ? resolveEnvVars(config.base_url) : undefined,
  };
}

/**
 * Load and parse a single TOML config file.
 */
function loadConfigFile(filePath: string): Config | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseToml(content);
    return ConfigSchema.parse(parsed);
  } catch (error) {
    throw new Error(`Failed to parse config file ${filePath}: ${error}`);
  }
}

/**
 * Merge multiple configs, with later configs taking precedence.
 */
function mergeConfigs(configs: Config[]): Config {
  const merged: Config = {
    aliases: {},
    models: {},
  };

  for (const config of configs) {
    // Merge aliases
    Object.assign(merged.aliases, config.aliases);
    // Merge models (later overrides earlier)
    Object.assign(merged.models, config.models);
  }

  return merged;
}

/**
 * Load config from all applicable locations.
 *
 * Search order:
 * 1. ~/.config/model-selector/config.toml (user defaults)
 * 2. ./model-selector.toml (project overrides)
 * 3. $MODEL_SELECTOR_CONFIG (custom path via env var)
 *
 * Configs are merged, with later ones overriding earlier ones.
 */
export function loadConfig(customPath?: string): Config {
  const configs: Config[] = [];
  const searchPaths = getConfigLocations();

  // Add custom path from env var or parameter
  const envPath = process.env['MODEL_SELECTOR_CONFIG'];
  if (envPath) {
    searchPaths.push(envPath);
  }
  if (customPath) {
    searchPaths.push(customPath);
  }

  for (const configPath of searchPaths) {
    const config = loadConfigFile(configPath);
    if (config) {
      configs.push(config);
    }
  }

  if (configs.length === 0) {
    throw new Error(
      `No config files found. Searched: ${searchPaths.join(', ')}\n` +
        'Create a config at ~/.config/model-selector/config.toml or ./model-selector.toml'
    );
  }

  const merged = mergeConfigs(configs);

  // Process model configs to resolve env vars
  const processedModels: Record<string, ModelConfig> = {};
  for (const [name, config] of Object.entries(merged.models)) {
    processedModels[name] = processModelConfig(config);
  }

  return {
    ...merged,
    models: processedModels,
  };
}

/**
 * Get enabled models from config.
 */
export function getEnabledModels(config: Config): Array<{ name: string; config: ModelConfig }> {
  return Object.entries(config.models)
    .filter(([, model]) => model.enabled)
    .map(([name, config]) => ({ name, config }));
}
