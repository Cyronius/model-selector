'use client';

import { useMemo } from 'react';
import { useConfig } from './useConfig.js';
import type { UseAliasesResult } from '../types.js';

/**
 * Hook for alias management.
 * Must be used within a ConfigProvider.
 */
export function useAliases(): UseAliasesResult {
  const { config, setAlias, removeAlias } = useConfig();

  const aliases = useMemo(() => {
    return config?.aliases ?? {};
  }, [config]);

  return {
    aliases,
    setAlias,
    removeAlias,
  };
}
