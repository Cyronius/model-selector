'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ConfigContext } from '../hooks/useConfig.js';
import * as api from '../api/client.js';
import type { Config, ModelConfig } from '../../types.js';
import type { ConfigContextValue } from '../types.js';

export interface ConfigProviderProps {
  children: React.ReactNode;
  /** Called when config changes */
  onConfigChange?: (config: Config) => void;
  /** Called on errors */
  onError?: (error: Error) => void;
}

/**
 * Provider component for config context.
 * Fetches config from the API server and manages mutations.
 */
export function ConfigProvider({
  children,
  onConfigChange,
  onError,
}: ConfigProviderProps): React.ReactElement {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const handleError = useCallback(
    (err: Error) => {
      setError(err);
      onError?.(err);
    },
    [onError]
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const newConfig = await api.fetchConfig();
      setConfig(newConfig);
      onConfigChange?.(newConfig);
    } catch (err) {
      handleError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [onConfigChange, handleError]);

  // Load config on mount
  useEffect(() => {
    reload();
  }, [reload]);

  const addModel = useCallback(
    async (name: string, modelConfig: ModelConfig) => {
      await api.addModel(name, modelConfig);
      await reload();
    },
    [reload]
  );

  const updateModel = useCallback(
    async (name: string, modelConfig: Partial<ModelConfig>) => {
      await api.updateModel(name, modelConfig);
      await reload();
    },
    [reload]
  );

  const removeModel = useCallback(
    async (name: string) => {
      await api.removeModel(name);
      await reload();
    },
    [reload]
  );

  const setAlias = useCallback(
    async (name: string, query: string) => {
      await api.setAlias(name, query);
      await reload();
    },
    [reload]
  );

  const removeAlias = useCallback(
    async (name: string) => {
      await api.removeAlias(name);
      await reload();
    },
    [reload]
  );

  const contextValue: ConfigContextValue = useMemo(
    () => ({
      config,
      loading,
      error,
      reload,
      addModel,
      updateModel,
      removeModel,
      setAlias,
      removeAlias,
    }),
    [config, loading, error, reload, addModel, updateModel, removeModel, setAlias, removeAlias]
  );

  return <ConfigContext.Provider value={contextValue}>{children}</ConfigContext.Provider>;
}
