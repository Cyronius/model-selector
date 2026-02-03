'use client';

import React from 'react';
import { getSupportedProviders } from '../../providers/registry.js';
import type { ProviderSelectProps } from '../types.js';

/**
 * Dropdown component for selecting a provider.
 */
export function ProviderSelect({
  value,
  onChange,
  providers,
  disabled = false,
  className,
}: ProviderSelectProps): React.ReactElement {
  const availableProviders = providers ?? getSupportedProviders();

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={className}
    >
      <option value="">Select provider...</option>
      {availableProviders.map((provider) => (
        <option key={provider} value={provider}>
          {provider}
        </option>
      ))}
    </select>
  );
}
