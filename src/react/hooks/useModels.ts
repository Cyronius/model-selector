'use client';

import { useMemo, useCallback } from 'react';
import { useConfig } from './useConfig.js';
import type { ModelConfig } from '../../types.js';
import type { UseModelsResult } from '../types.js';

/**
 * Hook for model CRUD operations.
 * Must be used within a ConfigProvider.
 */
export function useModels(): UseModelsResult {
  const { config, addModel, updateModel, removeModel } = useConfig();

  const models = useMemo(() => {
    if (!config) return [];
    return Object.entries(config.models).map(([name, modelConfig]) => ({
      name,
      config: modelConfig,
    }));
  }, [config]);

  const enabledModels = useMemo(() => {
    return models.filter((m) => m.config.enabled);
  }, [models]);

  const getModel = useCallback(
    (name: string): ModelConfig | undefined => {
      return config?.models[name];
    },
    [config]
  );

  const toggleModel = useCallback(
    async (name: string): Promise<void> => {
      const model = config?.models[name];
      if (model) {
        await updateModel(name, { enabled: !model.enabled });
      }
    },
    [config, updateModel]
  );

  return {
    models,
    enabledModels,
    getModel,
    addModel,
    updateModel,
    removeModel,
    toggleModel,
  };
}
