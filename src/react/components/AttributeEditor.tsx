'use client';

import React, { useState, useCallback } from 'react';
import type { ModelAttributes } from '../../types.js';
import type { AttributeEditorProps } from '../types.js';

/**
 * Component for editing model attributes.
 */
export function AttributeEditor({
  value,
  onChange,
  suggestions = [],
  disabled = false,
  className,
}: AttributeEditorProps): React.ReactElement {
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  const parseValue = useCallback((val: string): string | number | boolean => {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (!isNaN(Number(val)) && val.trim() !== '') return Number(val);
    return val;
  }, []);

  const handleAdd = useCallback(() => {
    if (!newKey.trim()) return;
    onChange({ ...value, [newKey]: parseValue(newValue) });
    setNewKey('');
    setNewValue('');
  }, [newKey, newValue, value, onChange, parseValue]);

  const handleRemove = useCallback(
    (key: string) => {
      const { [key]: _, ...rest } = value;
      onChange(rest);
    },
    [value, onChange]
  );

  const handleUpdate = useCallback(
    (key: string, newVal: string) => {
      onChange({ ...value, [key]: parseValue(newVal) });
    },
    [value, onChange, parseValue]
  );

  const unusedSuggestions = suggestions.filter((s) => !(s in value));

  return (
    <div className={className}>
      {Object.entries(value).map(([key, val]) => (
        <div key={key} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
          <span style={{ minWidth: '120px', fontWeight: 'bold' }}>{key}:</span>
          <input
            type="text"
            value={String(val)}
            onChange={(e) => handleUpdate(key, e.target.value)}
            disabled={disabled}
            style={{ width: '100px', marginLeft: '8px', marginRight: '8px' }}
          />
          <span style={{ color: '#666', marginRight: '8px' }}>
            ({typeof val})
          </span>
          {!disabled && (
            <button type="button" onClick={() => handleRemove(key)}>
              Remove
            </button>
          )}
        </div>
      ))}

      {!disabled && (
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder="Attribute name"
            list="attribute-suggestions"
            style={{ width: '120px' }}
          />
          <datalist id="attribute-suggestions">
            {unusedSuggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Value"
            style={{ width: '100px' }}
          />
          <button type="button" onClick={handleAdd}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}
