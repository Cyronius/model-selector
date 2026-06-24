// Config loader exports
export { loadConfig, getEnabledModels, resolveEnvVars } from './loader.js';

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
} from './writer.js';

export type { ConfigWriterOptions, WriteResult } from './writer.js';

// Error exports
export { ConfigError, ConfigErrorCode } from './errors.js';
