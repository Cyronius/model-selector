# model-selector React Components

React components and hooks for building configuration UIs for model-selector.

## Installation

```bash
npm install model-selector react
```

## Quick Start

Wrap your app with `ConfigProvider` and use the provided components:

```tsx
import { ConfigProvider, ModelList, ModelForm, AliasEditor } from 'model-selector/react';

function App() {
  return (
    <ConfigProvider configPath="./model-selector.toml">
      <MyConfigUI />
    </ConfigProvider>
  );
}
```

## Config Path Behavior

The `configPath` prop controls where configuration is read from and written to:

- **Project-local config** (recommended for most apps):
  ```tsx
  <ConfigProvider configPath="./model-selector.toml">
  ```

- **User's home directory** (for system-wide tools):
  ```tsx
  import { getDefaultConfigPath } from 'model-selector/config';

  <ConfigProvider configPath={getDefaultConfigPath()}>
  ```

If no `configPath` is provided, it defaults to the user's home directory config.

## Components

### ConfigProvider

Context provider that manages config loading and mutations. Must wrap all other components.

```tsx
<ConfigProvider
  configPath="./model-selector.toml"
  onConfigChange={(config) => console.log('Config updated:', config)}
  onError={(error) => console.error('Config error:', error)}
>
  {children}
</ConfigProvider>
```

**Props:**
- `configPath?: string` - Path to config file
- `onConfigChange?: (config: Config) => void` - Called when config changes
- `onError?: (error: Error) => void` - Called on errors

### ModelList

Displays a list of configured models.

```tsx
<ModelList
  filterEnabled={true}
  onSelectModel={(name, config) => setSelected(name)}
  renderItem={(name, config) => <div>{name}: {config.provider}</div>}
  renderEmpty={() => <p>No models yet</p>}
/>
```

**Props:**
- `filterEnabled?: boolean` - Only show enabled models
- `onSelectModel?: (name: string, config: ModelConfig) => void` - Selection callback
- `renderItem?: (name: string, config: ModelConfig) => ReactNode` - Custom item renderer
- `renderEmpty?: () => ReactNode` - Empty state renderer

### ModelForm

Form for adding or editing models.

```tsx
<ModelForm
  name="gpt4"                    // For edit mode
  initialValues={existingConfig} // For edit mode
  onSubmit={async (name, config) => {
    await addModel(name, config);
  }}
  onCancel={() => setEditing(false)}
/>
```

**Props:**
- `name?: string` - Model name (edit mode)
- `initialValues?: Partial<ModelConfig>` - Initial form values
- `providers?: string[]` - Available providers for dropdown
- `onSubmit: (name: string, config: ModelConfig) => Promise<void>` - Submit handler
- `onCancel?: () => void` - Cancel handler
- `showValidation?: boolean` - Show validation errors (default: true)

### AliasEditor

Editor for query aliases.

```tsx
<AliasEditor
  aliases={aliases}
  onChange={(newAliases) => updateAliases(newAliases)}
  validateQuery={(query) => ({ valid: true })}
/>
```

**Props:**
- `aliases: Aliases` - Current aliases object
- `onChange: (aliases: Aliases) => void` - Change handler
- `validateQuery?: (query: string) => { valid: boolean; error?: string }` - Validator

### AttributeEditor

Editor for model attributes.

```tsx
<AttributeEditor
  value={attributes}
  onChange={(attrs) => setAttributes(attrs)}
  suggestions={['speed', 'cost', 'context_window']}
/>
```

**Props:**
- `value: ModelAttributes` - Current attributes
- `onChange: (attributes: ModelAttributes) => void` - Change handler
- `suggestions?: string[]` - Autocomplete suggestions
- `disabled?: boolean` - Disable editing

### ProviderSelect

Dropdown for selecting a provider.

```tsx
<ProviderSelect
  value={provider}
  onChange={(p) => setProvider(p)}
  installedOnly={true}
/>
```

**Props:**
- `value: string` - Current provider
- `onChange: (provider: string) => void` - Change handler
- `providers?: string[]` - Limit to specific providers
- `installedOnly?: boolean` - Only show installed providers
- `disabled?: boolean` - Disable selection

## Hooks

### useConfig

Access the config context.

```tsx
const {
  config,      // Current config (or null if loading)
  loading,     // Loading state
  error,       // Error (or null)
  reload,      // Reload config from disk
  addModel,    // Add a new model
  updateModel, // Update existing model
  removeModel, // Remove a model
  setAlias,    // Add/update an alias
  removeAlias, // Remove an alias
} = useConfig();
```

### useModels

Work with models.

```tsx
const {
  models,        // Array of { name, config }
  enabledModels, // Only enabled models
  getModel,      // Get model by name
  addModel,      // Add model
  updateModel,   // Update model
  removeModel,   // Remove model
  toggleModel,   // Toggle enabled state
} = useModels();
```

### useAliases

Work with aliases.

```tsx
const {
  aliases,     // Current aliases object
  setAlias,    // Add/update alias
  removeAlias, // Remove alias
} = useAliases();
```

## Full Example

```tsx
import React, { useState } from 'react';
import {
  ConfigProvider,
  ModelList,
  ModelForm,
  AliasEditor,
  useConfig,
  useModels,
  useAliases,
} from 'model-selector/react';

function ConfigUI() {
  const { loading, error } = useConfig();
  const { models, addModel, removeModel } = useModels();
  const { aliases, setAlias, removeAlias } = useAliases();
  const [showForm, setShowForm] = useState(false);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h2>Models</h2>
      <ModelList onSelectModel={(name) => console.log('Selected:', name)} />

      <button onClick={() => setShowForm(true)}>Add Model</button>

      {showForm && (
        <ModelForm
          onSubmit={async (name, config) => {
            await addModel(name, config);
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <h2>Aliases</h2>
      <AliasEditor
        aliases={aliases}
        onChange={async (newAliases) => {
          // Handle changes
          for (const [name, query] of Object.entries(newAliases)) {
            if (query !== aliases[name]) {
              await setAlias(name, query);
            }
          }
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <ConfigProvider configPath="./model-selector.toml">
      <ConfigUI />
    </ConfigProvider>
  );
}
```

## Types

All types are exported from `model-selector/react`:

```tsx
import type {
  ConfigContextValue,
  ConfigProviderProps,
  ModelListProps,
  ModelFormProps,
  AttributeEditorProps,
  AliasEditorProps,
  ProviderSelectProps,
  UseModelsResult,
  UseAliasesResult,
} from 'model-selector/react';
```
