import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { stringify as stringifyToml } from 'smol-toml';
import { Config, ConfigSchema, ModelConfig, ModelConfigSchema } from '../types.js';
import { ConfigError, ConfigErrorCode } from './errors.js';
import { findExistingConfigPath } from './loader.js';

export interface ConfigWriterOptions {
  /** Path to write config. Defaults to ~/.config/model-selector/config.toml */
  configPath?: string;
  /** If true, create parent directories if they don't exist. Default: true */
  createDirectories?: boolean;
}

export interface WriteResult {
  success: boolean;
  path: string;
  error?: ConfigError;
}

/**
 * Get the default user config path (~/.config/model-selector/config.toml)
 */
export function getDefaultConfigPath(): string {
  return path.join(os.homedir(), '.config', 'model-selector', 'config.toml');
}

/**
 * Get the config path from options or default.
 */
function getConfigPath(options?: ConfigWriterOptions): string {
  if (options?.configPath) {
    return options.configPath;
  }
  // Find existing config using same logic as loader, or fall back to default
  return findExistingConfigPath() ?? getDefaultConfigPath();
}

/**
 * Ensure the config directory exists, create if needed.
 */
export async function ensureConfigDirectory(configPath?: string): Promise<void> {
  const filePath = configPath ?? getDefaultConfigPath();
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Load existing config or return empty config.
 */
async function loadExistingConfig(configPath: string): Promise<Config> {
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const { parse: parseToml } = await import('smol-toml');
    const parsed = parseToml(content);
    return ConfigSchema.parse(parsed);
  } catch (error) {
    // File doesn't exist or is invalid, return empty config
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { aliases: {}, models: {} };
    }
    throw error;
  }
}

/**
 * Write config to disk atomically.
 */
async function writeConfigToFile(
  config: Config,
  configPath: string,
  options?: ConfigWriterOptions
): Promise<WriteResult> {
  try {
    // Ensure directory exists
    if (options?.createDirectories !== false) {
      await ensureConfigDirectory(configPath);
    }

    // Serialize to TOML
    const tomlContent = stringifyToml(config as Record<string, unknown>);

    // Write atomically: temp file + rename
    const tempPath = `${configPath}.tmp.${process.pid}`;
    await fs.writeFile(tempPath, tomlContent, { mode: 0o600 });
    await fs.rename(tempPath, configPath);

    return { success: true, path: configPath };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    let code = ConfigErrorCode.WRITE_FAILED;
    if (err.code === 'EACCES') code = ConfigErrorCode.PERMISSION_DENIED;
    if (err.code === 'ENOENT') code = ConfigErrorCode.DIRECTORY_NOT_FOUND;

    return {
      success: false,
      path: configPath,
      error: new ConfigError(`Failed to write config: ${err.message}`, code),
    };
  }
}

/**
 * Validate a model config.
 */
export function validateModelConfig(config: unknown): { valid: boolean; errors: string[] } {
  const result = ModelConfigSchema.safeParse(config);
  if (result.success) {
    return { valid: true, errors: [] };
  }
  return {
    valid: false,
    errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}

/**
 * Validate the entire config.
 */
export function validateConfig(config: unknown): { valid: boolean; errors: string[] } {
  const result = ConfigSchema.safeParse(config);
  if (result.success) {
    return { valid: true, errors: [] };
  }
  return {
    valid: false,
    errors: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}

/**
 * Write a complete config to disk (overwrites existing).
 */
export async function writeConfig(
  config: Config,
  options?: ConfigWriterOptions
): Promise<WriteResult> {
  const validation = validateConfig(config);
  if (!validation.valid) {
    return {
      success: false,
      path: getConfigPath(options),
      error: new ConfigError(
        `Invalid config: ${validation.errors.join(', ')}`,
        ConfigErrorCode.INVALID_CONFIG
      ),
    };
  }

  return writeConfigToFile(config, getConfigPath(options), options);
}

/**
 * Read, modify, and write config atomically.
 */
export async function updateConfig(
  updater: (config: Config) => Config,
  options?: ConfigWriterOptions
): Promise<WriteResult> {
  const configPath = getConfigPath(options);
  const existing = await loadExistingConfig(configPath);
  const updated = updater(existing);
  return writeConfig(updated, options);
}

/**
 * Add a new model to the config.
 */
export async function addModel(
  name: string,
  config: ModelConfig,
  options?: ConfigWriterOptions
): Promise<WriteResult> {
  const validation = validateModelConfig(config);
  if (!validation.valid) {
    return {
      success: false,
      path: getConfigPath(options),
      error: new ConfigError(
        `Invalid model config: ${validation.errors.join(', ')}`,
        ConfigErrorCode.INVALID_MODEL
      ),
    };
  }

  const configPath = getConfigPath(options);
  const existing = await loadExistingConfig(configPath);

  if (existing.models[name]) {
    return {
      success: false,
      path: configPath,
      error: new ConfigError(
        `Model "${name}" already exists. Use updateModel() to modify.`,
        ConfigErrorCode.DUPLICATE_MODEL
      ),
    };
  }

  return writeConfig(
    {
      ...existing,
      models: { ...existing.models, [name]: config },
    },
    options
  );
}

/**
 * Update an existing model.
 */
export async function updateModel(
  name: string,
  config: Partial<ModelConfig>,
  options?: ConfigWriterOptions
): Promise<WriteResult> {
  const configPath = getConfigPath(options);
  const existing = await loadExistingConfig(configPath);

  if (!existing.models[name]) {
    return {
      success: false,
      path: configPath,
      error: new ConfigError(
        `Model "${name}" not found.`,
        ConfigErrorCode.MODEL_NOT_FOUND
      ),
    };
  }

  const merged = { ...existing.models[name], ...config };
  const validation = validateModelConfig(merged);
  if (!validation.valid) {
    return {
      success: false,
      path: configPath,
      error: new ConfigError(
        `Invalid model config: ${validation.errors.join(', ')}`,
        ConfigErrorCode.INVALID_MODEL
      ),
    };
  }

  return writeConfig(
    {
      ...existing,
      models: { ...existing.models, [name]: merged },
    },
    options
  );
}

/**
 * Remove a model from the config.
 */
export async function removeModel(
  name: string,
  options?: ConfigWriterOptions
): Promise<WriteResult> {
  const configPath = getConfigPath(options);
  const existing = await loadExistingConfig(configPath);

  if (!existing.models[name]) {
    return {
      success: false,
      path: configPath,
      error: new ConfigError(
        `Model "${name}" not found.`,
        ConfigErrorCode.MODEL_NOT_FOUND
      ),
    };
  }

  const { [name]: _, ...rest } = existing.models;
  return writeConfig(
    {
      ...existing,
      models: rest,
    },
    options
  );
}

/**
 * Enable or disable a model.
 */
export async function setModelEnabled(
  name: string,
  enabled: boolean,
  options?: ConfigWriterOptions
): Promise<WriteResult> {
  return updateModel(name, { enabled }, options);
}

/**
 * Add or update an alias.
 */
export async function setAlias(
  name: string,
  query: string,
  options?: ConfigWriterOptions
): Promise<WriteResult> {
  if (!name || typeof name !== 'string') {
    return {
      success: false,
      path: getConfigPath(options),
      error: new ConfigError('Alias name must be a non-empty string', ConfigErrorCode.INVALID_ALIAS),
    };
  }
  if (!query || typeof query !== 'string') {
    return {
      success: false,
      path: getConfigPath(options),
      error: new ConfigError('Alias query must be a non-empty string', ConfigErrorCode.INVALID_ALIAS),
    };
  }

  return updateConfig(
    (existing) => ({
      ...existing,
      aliases: { ...existing.aliases, [name]: query },
    }),
    options
  );
}

/**
 * Remove an alias.
 */
export async function removeAlias(
  name: string,
  options?: ConfigWriterOptions
): Promise<WriteResult> {
  const configPath = getConfigPath(options);
  const existing = await loadExistingConfig(configPath);

  if (!existing.aliases[name]) {
    return {
      success: false,
      path: configPath,
      error: new ConfigError(`Alias "${name}" not found.`, ConfigErrorCode.ALIAS_NOT_FOUND),
    };
  }

  const { [name]: _, ...rest } = existing.aliases;
  return writeConfig(
    {
      ...existing,
      aliases: rest,
    },
    options
  );
}
