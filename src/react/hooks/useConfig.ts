'use client';

import { createContext, useContext } from 'react';
import type { ConfigContextValue } from '../types.js';

const ConfigContext = createContext<ConfigContextValue | null>(null);

export { ConfigContext };

/**
 * Hook to access the config context.
 * Must be used within a ConfigProvider.
 */
export function useConfig(): ConfigContextValue {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within a ConfigProvider');
  }
  return context;
}
