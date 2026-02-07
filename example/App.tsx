import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  ConfigProvider,
  ModelForm,
  AliasEditor,
  useConfig,
  useModels,
  useAliases,
} from '../src/react/index.js';
import { parseQuery } from '../src/query/parser.js';
import { matchModel, normalizeScore, type MatchResult } from '../src/query/matcher.js';
import type { ModelConfig, Aliases, ModelAttributes } from '../src/types.js';

import './styles/global.css';
import styles from './styles/app.module.css';
import modelStyles from './styles/models.module.css';
import formStyles from './styles/form.module.css';
import aliasStyles from './styles/aliases.module.css';
import testerStyles from './styles/tester.module.css';

type Tab = 'models' | 'aliases' | 'tester';

// ============================================
// Standard Attributes
// ============================================

interface StandardAttribute {
  name: string;
  type: 'number' | 'boolean' | 'string';
  description: string;
  defaultValue: string | number | boolean;
}

const STANDARD_ATTRIBUTES: StandardAttribute[] = [
  { name: 'context_window', type: 'number', description: 'Max tokens (8k-200k)', defaultValue: 128000 },
  { name: 'cost', type: 'number', description: 'Cost scale (0-10)', defaultValue: 5 },
  { name: 'speed', type: 'number', description: 'Response speed (0-10)', defaultValue: 5 },
  { name: 'instruction_following', type: 'number', description: 'Instruction quality (0-10)', defaultValue: 7 },
  { name: 'functions', type: 'boolean', description: 'Function calling support', defaultValue: true },
  { name: 'reasoning', type: 'boolean', description: 'Reasoning capability', defaultValue: false },
  { name: 'local', type: 'boolean', description: 'Runs locally', defaultValue: false },
];

// ============================================
// Model Card Component
// ============================================

interface ModelCardProps {
  name: string;
  config: ModelConfig;
  isAnimating?: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

function ModelCard({ name, config, isAnimating, onEdit, onToggle, onDelete }: ModelCardProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const formatAttributeValue = (key: string, value: unknown): React.ReactNode => {
    if (typeof value === 'boolean') {
      return value ? (
        <span className={modelStyles.attributeBoolean}>yes</span>
      ) : (
        <span className={modelStyles.attributeBooleanFalse}>no</span>
      );
    }
    if (key === 'context_window' && typeof value === 'number') {
      return <span className={modelStyles.attributeValue}>{(value / 1000).toFixed(0)}k</span>;
    }
    return <span className={modelStyles.attributeValue}>{String(value)}</span>;
  };

  return (
    <>
      <div className={`${modelStyles.card} ${!config.enabled ? modelStyles.cardDisabled : ''} ${isAnimating ? modelStyles.cardAnimating : ''}`}>
        <div className={modelStyles.cardHeader}>
          <div className={modelStyles.cardTitle}>
            <span
              className={`${modelStyles.status} ${config.enabled ? modelStyles.statusEnabled : modelStyles.statusDisabled}`}
            />
            <span className={modelStyles.modelName}>{name}</span>
            {!config.enabled && <span className={modelStyles.disabledBadge}>disabled</span>}
          </div>
        </div>

        <div className={modelStyles.cardMeta}>
          {config.provider}
          <span className={modelStyles.separator}>/</span>
          {config.model_id}
        </div>

        {config.attributes && Object.keys(config.attributes).length > 0 && (
          <div className={modelStyles.attributes}>
            {Object.entries(config.attributes).map(([key, value]) => (
              <span key={key} className={modelStyles.attribute}>
                {key} {formatAttributeValue(key, value)}
              </span>
            ))}
          </div>
        )}

        <div className={modelStyles.cardActions}>
          <button
            className={`${modelStyles.actionButton} ${modelStyles.editButton}`}
            onClick={onEdit}
          >
            Edit
          </button>
          <button
            className={`${modelStyles.actionButton} ${modelStyles.toggleButton}`}
            onClick={onToggle}
          >
            {config.enabled ? 'Disable' : 'Enable'}
          </button>
          <button
            className={`${modelStyles.actionButton} ${modelStyles.deleteButton}`}
            onClick={() => setShowConfirm(true)}
          >
            Delete
          </button>
        </div>
      </div>

      {showConfirm && (
        <div className={modelStyles.confirmOverlay} onClick={() => setShowConfirm(false)}>
          <div className={modelStyles.confirmDialog} onClick={(e) => e.stopPropagation()}>
            <h3 className={modelStyles.confirmTitle}>Delete model?</h3>
            <p className={modelStyles.confirmMessage}>
              Are you sure you want to delete <strong>{name}</strong>? This action cannot be undone.
            </p>
            <div className={modelStyles.confirmActions}>
              <button className="btn-secondary" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                style={{ background: 'var(--color-danger)' }}
                onClick={() => {
                  onDelete();
                  setShowConfirm(false);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ============================================
// Model Form Modal
// ============================================

interface ModelFormModalProps {
  name?: string;
  initialValues?: Partial<ModelConfig>;
  models: Array<{ name: string; config: ModelConfig }>;
  onSubmit: (name: string, config: ModelConfig) => Promise<void>;
  onClose: () => void;
}

function ModelFormModal({ name, initialValues, models, onSubmit, onClose }: ModelFormModalProps) {
  return (
    <div className={formStyles.overlay} onClick={onClose}>
      <div className={formStyles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={formStyles.modalHeader}>
          <h2 className={formStyles.modalTitle}>{name ? `Edit ${name}` : 'Add Model'}</h2>
          <button className={formStyles.closeButton} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <ModelFormStyled
          name={name}
          initialValues={initialValues}
          models={models}
          onSubmit={onSubmit}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}

// Styled ModelForm wrapper
function ModelFormStyled({
  name,
  initialValues,
  models,
  onSubmit,
  onCancel,
}: {
  name?: string;
  initialValues?: Partial<ModelConfig>;
  models: Array<{ name: string; config: ModelConfig }>;
  onSubmit: (name: string, config: ModelConfig) => Promise<void>;
  onCancel: () => void;
}) {
  const [modelName, setModelName] = useState(name ?? '');
  const [provider, setProvider] = useState(initialValues?.provider ?? '');
  const [modelId, setModelId] = useState(initialValues?.model_id ?? '');
  const [apiKey, setApiKey] = useState(initialValues?.api_key ?? '');
  const [baseUrl, setBaseUrl] = useState(initialValues?.base_url ?? '');
  const [enabled, setEnabled] = useState(initialValues?.enabled ?? true);
  const [attributes, setAttributes] = useState<ModelAttributes>(initialValues?.attributes ?? {});
  const [showApiKey, setShowApiKey] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Stable ID tracking for attribute rows (prevents focus loss on key edit)
  const attributeIdCounter = useRef(0);
  const [attributeIds, setAttributeIds] = useState<Map<string, string>>(() => {
    const ids = new Map<string, string>();
    if (initialValues?.attributes) {
      Object.keys(initialValues.attributes).forEach((key) => {
        ids.set(key, `attr-${attributeIdCounter.current++}`);
      });
    }
    return ids;
  });

  // Attribute picker state - track which attribute row is focused for autocomplete
  const [focusedAttrId, setFocusedAttrId] = useState<string | null>(null);

  // Collect custom attributes from all models
  const customAttributes = useMemo(() => {
    const standardNames = new Set(STANDARD_ATTRIBUTES.map((a) => a.name));
    const custom = new Set<string>();
    models.forEach(({ config }) => {
      if (config.attributes) {
        Object.keys(config.attributes).forEach((key) => {
          if (!standardNames.has(key)) {
            custom.add(key);
          }
        });
      }
    });
    return Array.from(custom);
  }, [models]);

  const providers = ['openai', 'anthropic', 'google', 'mistral', 'ollama', 'groq', 'cohere'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    if (!modelName.trim()) {
      setErrors(['Model name is required']);
      return;
    }
    if (!provider) {
      setErrors(['Provider is required']);
      return;
    }
    if (!modelId.trim()) {
      setErrors(['Model ID is required']);
      return;
    }

    const config: ModelConfig = {
      provider,
      model_id: modelId,
      enabled,
      attributes,
      ...(apiKey && { api_key: apiKey }),
      ...(baseUrl && { base_url: baseUrl }),
    };

    setSubmitting(true);
    try {
      await onSubmit(modelName, config);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddAttribute = (attrName?: string, defaultValue?: string | number | boolean) => {
    const id = `attr-${attributeIdCounter.current++}`;
    const key = attrName ?? '';
    const value = defaultValue ?? '';
    setAttributes((prev) => ({ ...prev, [key]: value }));
    setAttributeIds((prev) => new Map(prev).set(key, id));
    setFocusedAttrId(id);
  };

  const handleSelectSuggestion = (currentKey: string, newKey: string, defaultValue?: string | number | boolean) => {
    setAttributes((prev) => {
      const val = defaultValue ?? prev[currentKey] ?? '';
      const { [currentKey]: _, ...rest } = prev;
      return { ...rest, [newKey]: val };
    });
    setAttributeIds((prev) => {
      const id = prev.get(currentKey);
      if (!id) return prev;
      const newMap = new Map(prev);
      newMap.delete(currentKey);
      newMap.set(newKey, id);
      return newMap;
    });
    setFocusedAttrId(null);
  };

  const handleRemoveAttribute = (key: string) => {
    setAttributes((prev) => {
      const { [key]: _, ...rest } = prev;
      return rest;
    });
    setAttributeIds((prev) => {
      const newMap = new Map(prev);
      newMap.delete(key);
      return newMap;
    });
  };

  const handleAttributeKeyChange = (oldKey: string, newKey: string) => {
    setAttributes((prev) => {
      const val = prev[oldKey];
      if (val === undefined) return prev;
      const { [oldKey]: _, ...rest } = prev;
      return { ...rest, [newKey]: val };
    });
    // Move the stable ID from oldKey to newKey
    setAttributeIds((prev) => {
      const id = prev.get(oldKey);
      if (!id) return prev;
      const newMap = new Map(prev);
      newMap.delete(oldKey);
      newMap.set(newKey, id);
      return newMap;
    });
  };

  const handleAttributeValueChange = (key: string, value: string) => {
    setAttributes((prev) => {
      let parsedValue: string | number | boolean = value;
      if (value === 'true') parsedValue = true;
      else if (value === 'false') parsedValue = false;
      else if (!isNaN(Number(value)) && value.trim() !== '') parsedValue = Number(value);
      return { ...prev, [key]: parsedValue };
    });
  };

  // Filter attributes for picker based on current key being edited
  const getFilteredAttributes = (currentKey: string) => {
    const search = currentKey.toLowerCase();
    const otherKeys = Object.keys(attributes).filter(k => k !== currentKey);

    const standardAttrs = STANDARD_ATTRIBUTES.filter(
      (a) =>
        !otherKeys.includes(a.name) &&
        a.name.toLowerCase().includes(search)
    );
    const customAttrs = customAttributes.filter(
      (a) =>
        !otherKeys.includes(a) &&
        a.toLowerCase().includes(search)
    );
    return { standardAttrs, customAttrs };
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className={formStyles.modalBody}>
        <div className={formStyles.form}>
          {errors.length > 0 && (
            <div className={formStyles.errors}>
              {errors.map((err, i) => (
                <div key={i} className={formStyles.errorItem}>
                  {err}
                </div>
              ))}
            </div>
          )}

          <div className={formStyles.field}>
            <label className={formStyles.label}>Name</label>
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              disabled={!!name}
              placeholder="e.g., gpt4-turbo"
              className="mono"
            />
          </div>

          <div className={formStyles.formRow}>
            <div className={formStyles.field}>
              <label className={formStyles.label}>Provider</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                <option value="">Select provider...</option>
                {providers.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className={formStyles.field}>
              <label className={formStyles.label}>Model ID</label>
              <input
                type="text"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="e.g., gpt-4-turbo-preview"
                className="mono"
              />
            </div>
          </div>

          <div className={formStyles.field}>
            <label className={formStyles.label}>API Key</label>
            <div className={formStyles.inputWrapper}>
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="$OPENAI_API_KEY"
                className="mono"
              />
              <button
                type="button"
                className={formStyles.inputAction}
                onClick={() => setShowApiKey(!showApiKey)}
                aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
              >
                {showApiKey ? '◠' : '◡'}
              </button>
            </div>
            <span className={formStyles.hint}>Use $ENV_VAR syntax to reference environment variables</span>
          </div>

          <div className={formStyles.field}>
            <label className={formStyles.label}>
              Base URL <span className={formStyles.labelOptional}>(optional)</span>
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="mono"
            />
          </div>

          <div className={formStyles.attributesSection}>
            <div className={formStyles.attributesHeader}>
              <span className={formStyles.attributesTitle}>Attributes</span>
              <button
                type="button"
                className={formStyles.addAttributeButton}
                onClick={() => handleAddAttribute()}
              >
                + Add
              </button>
            </div>
            {Object.keys(attributes).length === 0 ? (
              <div className={formStyles.attributesEmpty}>No attributes defined</div>
            ) : (
              <div className={formStyles.attributeList}>
                {Object.entries(attributes).map(([key, value]) => {
                  const stableId = attributeIds.get(key) ?? key;
                  const isFocused = focusedAttrId === stableId;
                  const { standardAttrs, customAttrs } = getFilteredAttributes(key);
                  const showDropdown = isFocused;

                  return (
                    <div key={stableId} className={formStyles.attributeRow}>
                      <div className={formStyles.attributeInputWrapper}>
                        <input
                          type="text"
                          value={key}
                          onChange={(e) => handleAttributeKeyChange(key, e.target.value)}
                          onFocus={() => setFocusedAttrId(stableId)}
                          onBlur={() => setTimeout(() => setFocusedAttrId(null), 150)}
                          placeholder="attribute"
                          className={formStyles.attributeInput}
                          autoFocus={isFocused}
                        />
                        {showDropdown && (
                          <div className={formStyles.inlineDropdown}>
                            {standardAttrs.length > 0 && (
                              <div className={formStyles.dropdownSection}>
                                <div className={formStyles.dropdownLabel}>Standard</div>
                                {standardAttrs.map((attr) => (
                                  <button
                                    key={attr.name}
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => handleSelectSuggestion(key, attr.name, attr.defaultValue)}
                                    className={formStyles.dropdownItem}
                                  >
                                    <span>{attr.name}</span>
                                    <span className={formStyles.typeHint}>({attr.type})</span>
                                  </button>
                                ))}
                              </div>
                            )}
                            {customAttrs.length > 0 && (
                              <div className={formStyles.dropdownSection}>
                                <div className={formStyles.dropdownLabel}>From Other Models</div>
                                {customAttrs.map((attrName) => (
                                  <button
                                    key={attrName}
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => handleSelectSuggestion(key, attrName)}
                                    className={formStyles.dropdownItem}
                                  >
                                    {attrName}
                                  </button>
                                ))}
                              </div>
                            )}
                            {standardAttrs.length === 0 &&
                              customAttrs.length === 0 && (
                                <div className={formStyles.dropdownSection}>
                                  {key.trim() !== '' ? (
                                    <button
                                      type="button"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() => setFocusedAttrId(null)}
                                      className={formStyles.dropdownItem}
                                    >
                                      Use "{key}"
                                    </button>
                                  ) : (
                                    <div className={formStyles.dropdownEmpty}>
                                      Type to search or create custom
                                    </div>
                                  )}
                                </div>
                              )}
                          </div>
                        )}
                      </div>
                      <input
                        type="text"
                        value={String(value)}
                        onChange={(e) => handleAttributeValueChange(key, e.target.value)}
                        placeholder="value"
                        className={formStyles.attributeInput}
                      />
                      <button
                        type="button"
                        className={formStyles.removeAttributeButton}
                        onClick={() => handleRemoveAttribute(key)}
                        aria-label="Remove attribute"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className={formStyles.checkboxField}>
            <input
              type="checkbox"
              id="enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <label htmlFor="enabled" className={formStyles.checkboxLabel}>
              Enabled
            </label>
          </div>
        </div>
      </div>

      <div className={formStyles.modalFooter}>
        <button type="button" className={formStyles.cancelButton} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={formStyles.submitButton} disabled={submitting}>
          {submitting ? 'Saving...' : name ? 'Update Model' : 'Add Model'}
        </button>
      </div>
    </form>
  );
}

// ============================================
// Models Panel
// ============================================

function ModelsPanel() {
  const { loading, error } = useConfig();
  const { models, addModel, updateModel, removeModel, toggleModel } = useModels();
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [animatingModel, setAnimatingModel] = useState<string | null>(null);

  const handleToggle = (name: string) => {
    setAnimatingModel(name);
    toggleModel(name);
    setTimeout(() => setAnimatingModel(null), 350);
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        Loading configuration...
      </div>
    );
  }

  if (error) {
    return <div className={styles.error}>Error: {error.message}</div>;
  }

  const editingConfig = editingModel ? models.find((m) => m.name === editingModel)?.config : undefined;

  return (
    <div>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>Models</h2>
        </div>
        <button
          className={styles.addButton}
          onClick={() => {
            setShowAddForm(true);
            setEditingModel(null);
          }}
        >
          <span className={styles.addIcon}>+</span>
          Add Model
        </button>
      </div>

      {(showAddForm || editingModel) && (
        <ModelFormModal
          name={editingModel ?? undefined}
          initialValues={editingConfig}
          models={models}
          onSubmit={async (name, config) => {
            if (editingModel) {
              await updateModel(name, config);
            } else {
              await addModel(name, config);
            }
            setEditingModel(null);
            setShowAddForm(false);
          }}
          onClose={() => {
            setEditingModel(null);
            setShowAddForm(false);
          }}
        />
      )}

      {models.length === 0 ? (
        <div className={styles.emptyState}>
          <h3 className={styles.emptyTitle}>No models configured</h3>
          <p className={styles.emptyDescription}>Add your first model to get started.</p>
          <button
            className={styles.addButton}
            onClick={() => setShowAddForm(true)}
          >
            <span className={styles.addIcon}>+</span>
            Add Model
          </button>
        </div>
      ) : (
        <div className={modelStyles.modelList}>
          {[...models]
            .sort((a, b) => {
              if (a.config.enabled === b.config.enabled) return 0;
              return a.config.enabled ? -1 : 1;
            })
            .map(({ name, config }) => (
              <ModelCard
                key={name}
                name={name}
                config={config}
                isAnimating={animatingModel === name}
                onEdit={() => {
                  setEditingModel(name);
                  setShowAddForm(false);
                }}
                onToggle={() => handleToggle(name)}
                onDelete={() => removeModel(name)}
              />
            ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Aliases Panel
// ============================================

function AliasesPanel() {
  const { loading, error } = useConfig();
  const { aliases, setAlias, removeAlias } = useAliases();
  const [newName, setNewName] = useState('');
  const [newQuery, setNewQuery] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        Loading configuration...
      </div>
    );
  }

  if (error) {
    return <div className={styles.error}>Error: {error.message}</div>;
  }

  const handleAdd = async () => {
    setAddError(null);
    if (!newName.trim()) {
      setAddError('Alias name is required');
      return;
    }
    if (!newQuery.trim()) {
      setAddError('Query is required');
      return;
    }
    try {
      await setAlias(newName.trim(), newQuery.trim());
      setNewName('');
      setNewQuery('');
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUpdateQuery = async (name: string, query: string) => {
    try {
      await setAlias(name, query);
    } catch (err) {
      console.error('Failed to update alias:', err);
    }
  };

  return (
    <div>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>Aliases</h2>
          <p className={styles.panelDescription}>Define shortcuts for common query patterns</p>
        </div>
      </div>

      <div className={aliasStyles.container}>
        {Object.keys(aliases).length > 0 && (
          <div className={aliasStyles.aliasList}>
            {Object.entries(aliases).map(([name, query]) => (
              <div key={name} className={aliasStyles.aliasRow}>
                <span className={aliasStyles.aliasName}>{name}</span>
                <span className={aliasStyles.arrow}>→</span>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => handleUpdateQuery(name, e.target.value)}
                  className={aliasStyles.aliasQuery}
                />
                <button
                  className={aliasStyles.removeButton}
                  onClick={() => removeAlias(name)}
                  aria-label={`Remove ${name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {Object.keys(aliases).length === 0 && (
          <div className={aliasStyles.empty}>No aliases defined</div>
        )}

        {addError && <div className={aliasStyles.error}>{addError}</div>}

        <div className={aliasStyles.addRow}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="alias"
            className={aliasStyles.addInput}
          />
          <span className={aliasStyles.arrow}>→</span>
          <input
            type="text"
            value={newQuery}
            onChange={(e) => setNewQuery(e.target.value)}
            placeholder="speed >= 7"
            className={aliasStyles.addInput}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button
            className={aliasStyles.addButton}
            onClick={handleAdd}
            disabled={!newName.trim() || !newQuery.trim()}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Query Tester Panel
// ============================================

interface TestResult {
  name: string;
  config: ModelConfig;
  result: MatchResult;
  normalizedScore: number;
}

function QueryTesterPanel() {
  const { loading, error, config } = useConfig();
  const { models } = useModels();
  const { aliases } = useAliases();
  const [query, setQuery] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);

  const results = useMemo(() => {
    if (!query.trim() || !config) {
      return null;
    }

    try {
      const parsed = parseQuery(query, aliases);
      setParseError(null);

      const testResults: TestResult[] = models
        .filter(({ config: modelConfig }) => modelConfig.enabled !== false)
        .map(({ name, config: modelConfig }) => {
          const result = matchModel(modelConfig.attributes ?? {}, parsed);
          return {
            name,
            config: modelConfig,
            result,
            normalizedScore: normalizeScore(result),
          };
        });

      // Sort by score descending
      testResults.sort((a, b) => b.normalizedScore - a.normalizedScore);

      return testResults;
    } catch (err) {
      setParseError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [query, models, aliases, config]);

  const matchingResults = results?.filter((r) => r.result.matches) ?? [];
  const nonMatchingResults = results?.filter((r) => !r.result.matches) ?? [];

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        Loading configuration...
      </div>
    );
  }

  if (error) {
    return <div className={styles.error}>Error: {error.message}</div>;
  }

  return (
    <div className={testerStyles.container}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>Query Tester</h2>
          <p className={styles.panelDescription}>Test how queries match against your configured models</p>
        </div>
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Try: fast, functions, !local"
        className={testerStyles.queryInput}
      />

      {parseError && <div className={testerStyles.parseError}>Parse error: {parseError}</div>}

      {!query.trim() ? (
        <div className={testerStyles.emptyState}>
          <div className={testerStyles.emptyIcon}>?</div>
          <h3 className={testerStyles.emptyTitle}>Enter a query to test</h3>
          <p className={testerStyles.emptyDescription}>
            See which models match your query and why
          </p>
        </div>
      ) : results && !parseError ? (
        <div className={testerStyles.results}>
          {matchingResults.length > 0 && (
            <div className={testerStyles.section}>
              <h3 className={testerStyles.sectionTitle}>Matches</h3>
              {matchingResults.map((r, i) => (
                <div key={r.name} className={testerStyles.resultCard}>
                  <div className={testerStyles.resultHeader}>
                    <div className={testerStyles.resultRank}>
                      <span className={testerStyles.rankNumber}>{i + 1}.</span>
                      <span
                        className={`${testerStyles.status} ${r.config.enabled ? testerStyles.statusEnabled : testerStyles.statusDisabled}`}
                      />
                      <span className={testerStyles.resultName}>{r.name}</span>
                    </div>
                    <span
                      className={`${testerStyles.resultScore} ${r.result.exactMatch ? testerStyles.scoreExact : ''}`}
                    >
                      {(r.normalizedScore * 100).toFixed(0)}%
                      {r.result.exactMatch && ' exact'}
                    </span>
                  </div>
                  <div className={testerStyles.matchDetails}>
                    {r.result.matchedAttributes.map((attr) => (
                      <span key={attr} className={testerStyles.matchItem}>
                        <span className={`${testerStyles.matchIcon} ${testerStyles.matchSuccess}`}>✓</span>
                        {attr}
                      </span>
                    ))}
                    {r.result.missingAttributes.map((attr) => (
                      <span key={attr} className={testerStyles.matchItem}>
                        <span className={`${testerStyles.matchIcon} ${testerStyles.matchFailed}`}>×</span>
                        {attr}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {nonMatchingResults.length > 0 && (
            <div className={testerStyles.section}>
              <h3 className={testerStyles.sectionTitle}>Not Matching</h3>
              {nonMatchingResults.map((r) => (
                <div key={r.name} className={`${testerStyles.resultCard} ${testerStyles.noMatchCard}`}>
                  <div className={testerStyles.resultHeader}>
                    <div className={testerStyles.resultRank}>
                      <span
                        className={`${testerStyles.status} ${r.config.enabled ? testerStyles.statusEnabled : testerStyles.statusDisabled}`}
                      />
                      <span className={testerStyles.resultName}>{r.name}</span>
                    </div>
                  </div>
                  <div className={testerStyles.matchDetails}>
                    {r.result.missingAttributes.map((attr) => (
                      <span key={attr} className={testerStyles.matchItem}>
                        <span className={`${testerStyles.matchIcon} ${testerStyles.matchMissing}`}>!</span>
                        missing: {attr}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {matchingResults.length === 0 && nonMatchingResults.length === 0 && (
            <div className={testerStyles.emptyState}>
              <h3 className={testerStyles.emptyTitle}>No models configured</h3>
              <p className={testerStyles.emptyDescription}>Add some models to test queries against them.</p>
            </div>
          )}
        </div>
      ) : null}

      <div className={testerStyles.queryHelp}>
        <h4 className={testerStyles.helpTitle}>Query syntax</h4>
        <div className={testerStyles.helpList}>
          <div className={testerStyles.helpItem}>
            <code className={testerStyles.helpExample}>fast</code>
            <span className={testerStyles.helpDesc}>Boolean: attribute must be true</span>
          </div>
          <div className={testerStyles.helpItem}>
            <code className={testerStyles.helpExample}>!local</code>
            <span className={testerStyles.helpDesc}>Negation: attribute must be false</span>
          </div>
          <div className={testerStyles.helpItem}>
            <code className={testerStyles.helpExample}>speed &gt;= 7</code>
            <span className={testerStyles.helpDesc}>Comparison: numeric threshold</span>
          </div>
          <div className={testerStyles.helpItem}>
            <code className={testerStyles.helpExample}>provider = openai</code>
            <span className={testerStyles.helpDesc}>Equality: exact value match</span>
          </div>
          <div className={testerStyles.helpItem}>
            <code className={testerStyles.helpExample}>fast, cheap</code>
            <span className={testerStyles.helpDesc}>Multiple conditions (comma-separated)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Main Config App
// ============================================

function ConfigApp() {
  const [activeTab, setActiveTab] = useState<Tab>('models');

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Model Selector</h1>
      </header>

      <nav className={styles.nav}>
        <button
          className={`${styles.tab} ${activeTab === 'models' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('models')}
        >
          Models
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'aliases' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('aliases')}
        >
          Aliases
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'tester' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('tester')}
        >
          Query Tester
        </button>
      </nav>

      <main className={styles.main}>
        {activeTab === 'models' && <ModelsPanel />}
        {activeTab === 'aliases' && <AliasesPanel />}
        {activeTab === 'tester' && <QueryTesterPanel />}
      </main>
    </div>
  );
}

// ============================================
// Root App with Provider
// ============================================

export function App() {
  return (
    <ConfigProvider onError={(err) => console.error('Config error:', err)}>
      <ConfigApp />
    </ConfigProvider>
  );
}
