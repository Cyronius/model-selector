'use client';

import React, { useState, useCallback } from 'react';
import type { Aliases } from '../../types.js';
import type { AliasEditorProps } from '../types.js';

/**
 * Component for editing query aliases.
 */
export function AliasEditor({
  aliases,
  onChange,
  validateQuery,
  className,
}: AliasEditorProps): React.ReactElement {
  const [newName, setNewName] = useState('');
  const [newQuery, setNewQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(() => {
    setError(null);

    if (!newName.trim()) {
      setError('Alias name is required');
      return;
    }

    if (!newQuery.trim()) {
      setError('Query is required');
      return;
    }

    if (validateQuery) {
      const result = validateQuery(newQuery);
      if (!result.valid) {
        setError(result.error ?? 'Invalid query');
        return;
      }
    }

    onChange({ ...aliases, [newName]: newQuery });
    setNewName('');
    setNewQuery('');
  }, [newName, newQuery, aliases, onChange, validateQuery]);

  const handleRemove = useCallback(
    (name: string) => {
      const { [name]: _, ...rest } = aliases;
      onChange(rest);
    },
    [aliases, onChange]
  );

  const handleUpdate = useCallback(
    (name: string, query: string) => {
      if (validateQuery) {
        const result = validateQuery(query);
        if (!result.valid) {
          return; // Don't update if invalid
        }
      }
      onChange({ ...aliases, [name]: query });
    },
    [aliases, onChange, validateQuery]
  );

  return (
    <div className={className}>
      <div style={{ marginBottom: '16px' }}>
        {Object.entries(aliases).map(([name, query]) => (
          <div key={name} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
            <strong style={{ minWidth: '100px' }}>{name}:</strong>
            <input
              type="text"
              value={query}
              onChange={(e) => handleUpdate(name, e.target.value)}
              style={{ flex: 1, marginLeft: '8px', marginRight: '8px' }}
            />
            <button type="button" onClick={() => handleRemove(name)}>
              Remove
            </button>
          </div>
        ))}
        {Object.keys(aliases).length === 0 && (
          <div style={{ color: '#666' }}>No aliases defined</div>
        )}
      </div>

      <div style={{ borderTop: '1px solid #ccc', paddingTop: '16px' }}>
        <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>Add New Alias</div>
        {error && <div style={{ color: 'red', marginBottom: '8px' }}>{error}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Alias name"
            style={{ width: '120px' }}
          />
          <input
            type="text"
            value={newQuery}
            onChange={(e) => setNewQuery(e.target.value)}
            placeholder="Query (e.g., speed >= 7)"
            style={{ flex: 1 }}
          />
          <button type="button" onClick={handleAdd}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
