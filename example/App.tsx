import React, { useState } from 'react';
import {
  ConfigProvider,
  ModelForm,
  AliasEditor,
  useConfig,
  useModels,
  useAliases,
} from '../src/react/index.js';
import type { ModelConfig, Aliases } from '../src/types.js';

type Tab = 'models' | 'aliases';

function ModelsPanel() {
  const { loading, error } = useConfig();
  const { models, addModel, updateModel, removeModel, toggleModel } = useModels();
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div style={{ color: 'red' }}>Error: {error.message}</div>;
  }

  const editingConfig = editingModel ? models.find((m) => m.name === editingModel)?.config : undefined;

  return (
    <div>
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={() => {
            setShowAddForm(true);
            setEditingModel(null);
          }}
          style={{ padding: '8px 16px', fontSize: '14px' }}
        >
          + Add Model
        </button>
      </div>

      {(showAddForm || editingModel) && (
        <div
          style={{
            background: 'white',
            padding: '20px',
            borderRadius: '8px',
            marginBottom: '20px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          <h3 style={{ marginTop: 0 }}>{editingModel ? `Edit: ${editingModel}` : 'Add New Model'}</h3>
          <ModelForm
            name={editingModel ?? undefined}
            initialValues={editingConfig}
            onSubmit={async (name, config) => {
              if (editingModel) {
                await updateModel(name, config);
              } else {
                await addModel(name, config);
              }
              setEditingModel(null);
              setShowAddForm(false);
            }}
            onCancel={() => {
              setEditingModel(null);
              setShowAddForm(false);
            }}
          />
        </div>
      )}

      <div
        style={{
          background: 'white',
          padding: '20px',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Configured Models</h3>
        {models.length === 0 ? (
          <p style={{ color: '#666' }}>No models configured yet.</p>
        ) : (
          <div>
            {models.map(({ name, config }) => (
              <div
                key={name}
                style={{
                  padding: '12px',
                  borderBottom: '1px solid #eee',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <strong>{name}</strong>
                  <span style={{ marginLeft: '12px', color: '#666' }}>
                    {config.provider} / {config.model_id}
                  </span>
                  {!config.enabled && (
                    <span style={{ marginLeft: '8px', color: '#999', fontStyle: 'italic' }}>
                      (disabled)
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => toggleModel(name)}>
                    {config.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => {
                      setEditingModel(name);
                      setShowAddForm(false);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Delete model "${name}"?`)) {
                        removeModel(name);
                      }
                    }}
                    style={{ color: 'red' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AliasesPanel() {
  const { loading, error } = useConfig();
  const { aliases, setAlias, removeAlias } = useAliases();
  const [localAliases, setLocalAliases] = useState<Aliases | null>(null);

  // Sync local state with context
  React.useEffect(() => {
    setLocalAliases(aliases);
  }, [aliases]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div style={{ color: 'red' }}>Error: {error.message}</div>;
  }

  const handleChange = async (newAliases: Aliases) => {
    setLocalAliases(newAliases);

    // Find what changed
    const oldKeys = Object.keys(aliases);
    const newKeys = Object.keys(newAliases);

    // Handle additions and updates
    for (const key of newKeys) {
      if (newAliases[key] !== aliases[key]) {
        await setAlias(key, newAliases[key]);
      }
    }

    // Handle removals
    for (const key of oldKeys) {
      if (!(key in newAliases)) {
        await removeAlias(key);
      }
    }
  };

  return (
    <div
      style={{
        background: 'white',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      }}
    >
      <h3 style={{ marginTop: 0 }}>Query Aliases</h3>
      <p style={{ color: '#666', marginBottom: '16px' }}>
        Define shortcuts for common query patterns. For example, <code>fast = "speed &gt;= 7"</code>
      </p>
      <AliasEditor aliases={localAliases ?? aliases} onChange={handleChange} />
    </div>
  );
}

function ConfigApp() {
  const [activeTab, setActiveTab] = useState<Tab>('models');

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '8px' }}>Model Selector Config</h1>

      <div style={{ marginBottom: '20px', display: 'flex', gap: '8px' }}>
        <button
          onClick={() => setActiveTab('models')}
          style={{
            padding: '10px 20px',
            background: activeTab === 'models' ? '#007bff' : '#e9ecef',
            color: activeTab === 'models' ? 'white' : '#333',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Models
        </button>
        <button
          onClick={() => setActiveTab('aliases')}
          style={{
            padding: '10px 20px',
            background: activeTab === 'aliases' ? '#007bff' : '#e9ecef',
            color: activeTab === 'aliases' ? 'white' : '#333',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Aliases
        </button>
      </div>

      {activeTab === 'models' && <ModelsPanel />}
      {activeTab === 'aliases' && <AliasesPanel />}
    </div>
  );
}

export function App() {
  return (
    <ConfigProvider onError={(err) => console.error('Config error:', err)}>
      <ConfigApp />
    </ConfigProvider>
  );
}
