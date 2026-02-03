'use client';

import React from 'react';
import { useModels } from '../hooks/useModels.js';
import type { ModelListProps } from '../types.js';

/**
 * Component to display a list of configured models.
 */
export function ModelList({
  filterEnabled,
  onSelectModel,
  renderItem,
  renderEmpty,
  className,
}: ModelListProps): React.ReactElement {
  const { models, enabledModels } = useModels();

  const displayModels = filterEnabled ? enabledModels : models;

  if (displayModels.length === 0) {
    if (renderEmpty) {
      return <>{renderEmpty()}</>;
    }
    return <div className={className}>No models configured</div>;
  }

  return (
    <div className={className}>
      {displayModels.map(({ name, config }) => (
        <div
          key={name}
          onClick={() => onSelectModel?.(name, config)}
          style={{ cursor: onSelectModel ? 'pointer' : 'default' }}
        >
          {renderItem ? (
            renderItem(name, config)
          ) : (
            <div>
              <strong>{name}</strong>
              <span style={{ marginLeft: '8px', opacity: 0.7 }}>
                {config.provider} / {config.model_id}
              </span>
              {!config.enabled && (
                <span style={{ marginLeft: '8px', color: '#999' }}>(disabled)</span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
