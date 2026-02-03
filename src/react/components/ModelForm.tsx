'use client';

import React, { useState, useCallback } from 'react';
import { validateModelConfig } from '../../config/writer.js';
import { getSupportedProviders } from '../../providers/registry.js';
import type { ModelConfig, ModelAttributes } from '../../types.js';
import type { ModelFormProps } from '../types.js';

/**
 * Form component for adding or editing a model.
 */
export function ModelForm({
  name: initialName,
  initialValues,
  providers,
  onSubmit,
  onCancel,
  showValidation = true,
  className,
}: ModelFormProps): React.ReactElement {
  const [name, setName] = useState(initialName ?? '');
  const [provider, setProvider] = useState(initialValues?.provider ?? '');
  const [modelId, setModelId] = useState(initialValues?.model_id ?? '');
  const [apiKey, setApiKey] = useState(initialValues?.api_key ?? '');
  const [baseUrl, setBaseUrl] = useState(initialValues?.base_url ?? '');
  const [enabled, setEnabled] = useState(initialValues?.enabled ?? true);
  const [attributes, setAttributes] = useState<ModelAttributes>(initialValues?.attributes ?? {});
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const availableProviders = providers ?? getSupportedProviders();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setErrors([]);

      const config: ModelConfig = {
        provider,
        model_id: modelId,
        enabled,
        attributes,
        ...(apiKey && { api_key: apiKey }),
        ...(baseUrl && { base_url: baseUrl }),
      };

      if (showValidation) {
        const validation = validateModelConfig(config);
        if (!validation.valid) {
          setErrors(validation.errors);
          return;
        }
      }

      if (!name.trim()) {
        setErrors(['Model name is required']);
        return;
      }

      setSubmitting(true);
      try {
        await onSubmit(name, config);
      } catch (err) {
        setErrors([err instanceof Error ? err.message : String(err)]);
      } finally {
        setSubmitting(false);
      }
    },
    [name, provider, modelId, apiKey, baseUrl, enabled, attributes, showValidation, onSubmit]
  );

  const handleAttributeChange = useCallback((key: string, value: string) => {
    setAttributes((prev) => {
      // Try to parse as number or boolean
      let parsedValue: string | number | boolean = value;
      if (value === 'true') parsedValue = true;
      else if (value === 'false') parsedValue = false;
      else if (!isNaN(Number(value)) && value.trim() !== '') parsedValue = Number(value);

      return { ...prev, [key]: parsedValue };
    });
  }, []);

  const handleRemoveAttribute = useCallback((key: string) => {
    setAttributes((prev) => {
      const { [key]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const handleAddAttribute = useCallback(() => {
    const key = `attr_${Object.keys(attributes).length + 1}`;
    setAttributes((prev) => ({ ...prev, [key]: '' }));
  }, [attributes]);

  return (
    <form onSubmit={handleSubmit} className={className}>
      {errors.length > 0 && (
        <div style={{ color: 'red', marginBottom: '16px' }}>
          {errors.map((err, i) => (
            <div key={i}>{err}</div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: '12px' }}>
        <label>
          Name:
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!!initialName}
            style={{ marginLeft: '8px' }}
          />
        </label>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label>
          Provider:
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            style={{ marginLeft: '8px' }}
          >
            <option value="">Select provider...</option>
            {availableProviders.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label>
          Model ID:
          <input
            type="text"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            style={{ marginLeft: '8px' }}
          />
        </label>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label>
          API Key:
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="$OPENAI_API_KEY"
            style={{ marginLeft: '8px' }}
          />
        </label>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label>
          Base URL:
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="Optional custom base URL"
            style={{ marginLeft: '8px' }}
          />
        </label>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span style={{ marginLeft: '8px' }}>Enabled</span>
        </label>
      </div>

      <fieldset style={{ marginBottom: '12px' }}>
        <legend>Attributes</legend>
        {Object.entries(attributes).map(([key, value]) => (
          <div key={key} style={{ marginBottom: '8px' }}>
            <input
              type="text"
              value={key}
              onChange={(e) => {
                const newKey = e.target.value;
                setAttributes((prev) => {
                  const val = prev[key];
                  if (val === undefined) return prev;
                  const { [key]: _, ...rest } = prev;
                  return { ...rest, [newKey]: val };
                });
              }}
              style={{ marginRight: '8px', width: '100px' }}
            />
            <input
              type="text"
              value={String(value)}
              onChange={(e) => handleAttributeChange(key, e.target.value)}
              style={{ marginRight: '8px', width: '100px' }}
            />
            <button type="button" onClick={() => handleRemoveAttribute(key)}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" onClick={handleAddAttribute}>
          Add Attribute
        </button>
      </fieldset>

      <div style={{ marginTop: '16px' }}>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : initialName ? 'Update Model' : 'Add Model'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} style={{ marginLeft: '8px' }}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
