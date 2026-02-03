import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import {
  writeConfig,
  addModel,
  updateModel,
  removeModel,
  setModelEnabled,
  setAlias,
  removeAlias,
  getDefaultConfigPath,
  validateModelConfig,
  validateConfig,
} from './writer.js';
import { ConfigErrorCode } from './errors.js';
import type { Config, ModelConfig } from '../types.js';

describe('Config Writer', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'model-selector-test-'));
    configPath = path.join(tempDir, 'config.toml');
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true });
  });

  describe('getDefaultConfigPath', () => {
    it('returns path in home config directory', () => {
      const result = getDefaultConfigPath();
      expect(result).toContain('.config');
      expect(result).toContain('model-selector');
      expect(result).toContain('config.toml');
    });
  });

  describe('validateModelConfig', () => {
    it('validates correct model config', () => {
      const config: ModelConfig = {
        provider: 'openai',
        model_id: 'gpt-4',
        enabled: true,
        attributes: { speed: 7 },
      };
      const result = validateModelConfig(config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects missing provider', () => {
      const result = validateModelConfig({ model_id: 'gpt-4' });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects missing model_id', () => {
      const result = validateModelConfig({ provider: 'openai' });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateConfig', () => {
    it('validates correct config', () => {
      const config: Config = {
        aliases: { fast: 'speed >= 7' },
        models: {
          gpt4: {
            provider: 'openai',
            model_id: 'gpt-4',
            enabled: true,
            attributes: {},
          },
        },
      };
      const result = validateConfig(config);
      expect(result.valid).toBe(true);
    });

    it('rejects invalid models', () => {
      const result = validateConfig({
        aliases: {},
        models: { bad: { provider: 'openai' } }, // missing model_id
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('writeConfig', () => {
    it('writes valid TOML config to disk', async () => {
      const config: Config = {
        aliases: { fast: 'speed >= 7' },
        models: {
          gpt4: {
            provider: 'openai',
            model_id: 'gpt-4-turbo',
            api_key: '$OPENAI_API_KEY',
            enabled: true,
            attributes: { speed: 6, cost: 8 },
          },
        },
      };

      const result = await writeConfig(config, { configPath });
      expect(result.success).toBe(true);
      expect(result.path).toBe(configPath);

      // Verify file was written
      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = parseToml(content) as Config;
      expect(parsed['aliases']).toEqual({ fast: 'speed >= 7' });
      expect(parsed['models']['gpt4']).toBeDefined();
    });

    it('creates parent directories if needed', async () => {
      const nestedPath = path.join(tempDir, 'a', 'b', 'c', 'config.toml');
      const config: Config = { aliases: {}, models: {} };

      const result = await writeConfig(config, { configPath: nestedPath });
      expect(result.success).toBe(true);

      const exists = await fs.access(nestedPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('returns error for invalid config', async () => {
      const result = await writeConfig(
        { aliases: {}, models: { bad: { provider: 'x' } } } as unknown as Config,
        { configPath }
      );
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ConfigErrorCode.INVALID_CONFIG);
    });
  });

  describe('addModel', () => {
    it('adds a new model to empty config', async () => {
      const model: ModelConfig = {
        provider: 'openai',
        model_id: 'gpt-4',
        enabled: true,
        attributes: { speed: 7 },
      };

      const result = await addModel('mymodel', model, { configPath });
      expect(result.success).toBe(true);

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = parseToml(content) as Config;
      expect(parsed['models']['mymodel']).toBeDefined();
    });

    it('adds a model to existing config', async () => {
      // Create initial config
      const initial: Config = {
        aliases: {},
        models: {
          existing: {
            provider: 'anthropic',
            model_id: 'claude-3',
            enabled: true,
            attributes: {},
          },
        },
      };
      await writeConfig(initial, { configPath });

      // Add new model
      const model: ModelConfig = {
        provider: 'openai',
        model_id: 'gpt-4',
        enabled: true,
        attributes: {},
      };
      const result = await addModel('newmodel', model, { configPath });
      expect(result.success).toBe(true);

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = parseToml(content) as Config;
      expect(parsed['models']['existing']).toBeDefined();
      expect(parsed['models']['newmodel']).toBeDefined();
    });

    it('returns error if model already exists', async () => {
      const model: ModelConfig = {
        provider: 'openai',
        model_id: 'gpt-4',
        enabled: true,
        attributes: {},
      };
      await addModel('mymodel', model, { configPath });

      const result = await addModel('mymodel', model, { configPath });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ConfigErrorCode.DUPLICATE_MODEL);
    });

    it('validates model config', async () => {
      const result = await addModel(
        'bad',
        { provider: 'openai' } as unknown as ModelConfig,
        { configPath }
      );
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ConfigErrorCode.INVALID_MODEL);
    });
  });

  describe('updateModel', () => {
    beforeEach(async () => {
      const initial: Config = {
        aliases: {},
        models: {
          mymodel: {
            provider: 'openai',
            model_id: 'gpt-4',
            enabled: true,
            attributes: { speed: 5 },
          },
        },
      };
      await writeConfig(initial, { configPath });
    });

    it('updates existing model properties', async () => {
      const result = await updateModel('mymodel', { model_id: 'gpt-4-turbo' }, { configPath });
      expect(result.success).toBe(true);

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = parseToml(content) as Config;
      const model = parsed['models']['mymodel'];
      expect(model?.model_id).toBe('gpt-4-turbo');
    });

    it('merges with existing attributes', async () => {
      const result = await updateModel(
        'mymodel',
        { attributes: { cost: 8 } },
        { configPath }
      );
      expect(result.success).toBe(true);

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = parseToml(content) as Config;
      const model = parsed['models']['mymodel'];
      expect(model?.attributes['cost']).toBe(8);
    });

    it('returns error if model not found', async () => {
      const result = await updateModel('nonexistent', { enabled: false }, { configPath });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ConfigErrorCode.MODEL_NOT_FOUND);
    });
  });

  describe('removeModel', () => {
    beforeEach(async () => {
      const initial: Config = {
        aliases: {},
        models: {
          model1: { provider: 'openai', model_id: 'gpt-4', enabled: true, attributes: {} },
          model2: { provider: 'anthropic', model_id: 'claude', enabled: true, attributes: {} },
        },
      };
      await writeConfig(initial, { configPath });
    });

    it('removes an existing model', async () => {
      const result = await removeModel('model1', { configPath });
      expect(result.success).toBe(true);

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = parseToml(content) as Config;
      expect(parsed['models']['model1']).toBeUndefined();
      expect(parsed['models']['model2']).toBeDefined();
    });

    it('returns error if model not found', async () => {
      const result = await removeModel('nonexistent', { configPath });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ConfigErrorCode.MODEL_NOT_FOUND);
    });
  });

  describe('setModelEnabled', () => {
    beforeEach(async () => {
      const initial: Config = {
        aliases: {},
        models: {
          mymodel: { provider: 'openai', model_id: 'gpt-4', enabled: true, attributes: {} },
        },
      };
      await writeConfig(initial, { configPath });
    });

    it('disables a model', async () => {
      const result = await setModelEnabled('mymodel', false, { configPath });
      expect(result.success).toBe(true);

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = parseToml(content) as Config;
      const model = parsed['models']['mymodel'];
      expect(model?.enabled).toBe(false);
    });

    it('enables a disabled model', async () => {
      await setModelEnabled('mymodel', false, { configPath });
      const result = await setModelEnabled('mymodel', true, { configPath });
      expect(result.success).toBe(true);

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = parseToml(content) as Config;
      const model = parsed['models']['mymodel'];
      expect(model?.enabled).toBe(true);
    });
  });

  describe('setAlias', () => {
    it('adds a new alias to empty config', async () => {
      const result = await setAlias('fast', 'speed >= 7', { configPath });
      expect(result.success).toBe(true);

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = parseToml(content) as Config;
      expect(parsed['aliases']['fast']).toBe('speed >= 7');
    });

    it('updates an existing alias', async () => {
      await setAlias('fast', 'speed >= 7', { configPath });
      const result = await setAlias('fast', 'speed >= 9', { configPath });
      expect(result.success).toBe(true);

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = parseToml(content) as Config;
      expect(parsed['aliases']['fast']).toBe('speed >= 9');
    });

    it('rejects empty alias name', async () => {
      const result = await setAlias('', 'speed >= 7', { configPath });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ConfigErrorCode.INVALID_ALIAS);
    });

    it('rejects empty query', async () => {
      const result = await setAlias('fast', '', { configPath });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ConfigErrorCode.INVALID_ALIAS);
    });
  });

  describe('removeAlias', () => {
    beforeEach(async () => {
      const initial: Config = {
        aliases: { fast: 'speed >= 7', cheap: 'cost <= 3' },
        models: {},
      };
      await writeConfig(initial, { configPath });
    });

    it('removes an existing alias', async () => {
      const result = await removeAlias('fast', { configPath });
      expect(result.success).toBe(true);

      const content = await fs.readFile(configPath, 'utf-8');
      const parsed = parseToml(content) as Config;
      expect(parsed['aliases']['fast']).toBeUndefined();
      expect(parsed['aliases']['cheap']).toBe('cost <= 3');
    });

    it('returns error if alias not found', async () => {
      const result = await removeAlias('nonexistent', { configPath });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(ConfigErrorCode.ALIAS_NOT_FOUND);
    });
  });
});
