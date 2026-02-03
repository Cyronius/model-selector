import type { Config, ModelConfig, Aliases, ModelAttributes } from '../types.js';

// === Context Types ===

export interface ConfigContextValue {
  config: Config | null;
  loading: boolean;
  error: Error | null;

  // Actions
  reload: () => Promise<void>;
  addModel: (name: string, config: ModelConfig) => Promise<void>;
  updateModel: (name: string, config: Partial<ModelConfig>) => Promise<void>;
  removeModel: (name: string) => Promise<void>;
  setAlias: (name: string, query: string) => Promise<void>;
  removeAlias: (name: string) => Promise<void>;
}

// === Component Props ===

export interface ConfigProviderProps {
  children: React.ReactNode;
  /** Called when config changes */
  onConfigChange?: (config: Config) => void;
  /** Called on errors */
  onError?: (error: Error) => void;
}

export interface ModelListProps {
  /** Filter models by enabled status */
  filterEnabled?: boolean;
  /** Called when a model is selected */
  onSelectModel?: (name: string, config: ModelConfig) => void;
  /** Custom render for each model item */
  renderItem?: (name: string, config: ModelConfig) => React.ReactNode;
  /** Empty state render */
  renderEmpty?: () => React.ReactNode;
  /** CSS class name */
  className?: string;
}

export interface ModelFormProps {
  /** Model name (for edit mode) */
  name?: string;
  /** Initial values (for edit mode) */
  initialValues?: Partial<ModelConfig>;
  /** Available providers to show in dropdown */
  providers?: string[];
  /** Default attributes to suggest */
  defaultAttributes?: string[];
  /** Called on form submit */
  onSubmit: (name: string, config: ModelConfig) => Promise<void>;
  /** Called on cancel */
  onCancel?: () => void;
  /** Show validation errors inline */
  showValidation?: boolean;
  /** CSS class name */
  className?: string;
}

export interface AttributeEditorProps {
  value: ModelAttributes;
  onChange: (attributes: ModelAttributes) => void;
  /** Suggested attribute names for autocomplete */
  suggestions?: string[];
  /** Disable editing */
  disabled?: boolean;
  className?: string;
}

export interface AliasEditorProps {
  aliases: Aliases;
  onChange: (aliases: Aliases) => void;
  /** Validate alias queries */
  validateQuery?: (query: string) => { valid: boolean; error?: string };
  className?: string;
}

export interface ProviderSelectProps {
  value: string;
  onChange: (provider: string) => void;
  /** Limit to specific providers */
  providers?: string[];
  /** Show only installed providers */
  installedOnly?: boolean;
  disabled?: boolean;
  className?: string;
}

// === Hook Return Types ===

export interface UseModelsResult {
  models: Array<{ name: string; config: ModelConfig }>;
  enabledModels: Array<{ name: string; config: ModelConfig }>;
  getModel: (name: string) => ModelConfig | undefined;
  addModel: (name: string, config: ModelConfig) => Promise<void>;
  updateModel: (name: string, config: Partial<ModelConfig>) => Promise<void>;
  removeModel: (name: string) => Promise<void>;
  toggleModel: (name: string) => Promise<void>;
}

export interface UseAliasesResult {
  aliases: Aliases;
  setAlias: (name: string, query: string) => Promise<void>;
  removeAlias: (name: string) => Promise<void>;
}
