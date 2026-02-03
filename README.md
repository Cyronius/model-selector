# model-selector

Runtime LLM model selection using query-based matching with Vercel AI SDK.

Instead of hardcoding which model to use, write simple queries like `"fast, cheap"` and let model-selector automatically choose the best matching model from your configuration.

## Features

- **Query-based selection** - Express requirements naturally: `"fast, cheap, functions"`
- **8+ provider support** - OpenAI, Anthropic, Google, Mistral, Groq, Cohere, Azure, Ollama
- **TOML configuration** - Define models and attributes in config files
- **Automatic ranking** - Models scored and sorted by match quality
- **Graceful fallbacks** - Returns best partial match when no exact match exists
- **Optional dependencies** - Install only the provider packages you need

## Installation

```bash
npm install model-selector ai
```

Then install provider packages for the models you want to use:

```bash
# Pick the ones you need
npm install @ai-sdk/openai      # OpenAI
npm install @ai-sdk/anthropic   # Anthropic
npm install @ai-sdk/google      # Google
npm install @ai-sdk/mistral     # Mistral
npm install @ai-sdk/groq        # Groq
npm install @ai-sdk/cohere      # Cohere
npm install @ai-sdk/azure       # Azure OpenAI
npm install ollama-ai-provider  # Ollama (local)
```

## Quick Start

```typescript
import { selectModel } from 'model-selector';
import { generateText } from 'ai';

// Select the best matching model
const model = await selectModel("fast, cheap");

// Use with Vercel AI SDK
const { text } = await generateText({
  model,
  prompt: 'Explain quantum computing in one sentence.',
});
```

## Configuration

Create a config file at one of these locations (later files override earlier):

1. `~/.config/model-selector/config.toml` - User defaults
2. `./model-selector.toml` - Project-specific config
3. `$MODEL_SELECTOR_CONFIG` environment variable path
4. Custom path via `configPath` option

### Example Configuration

```toml
# Aliases for common query patterns
[aliases]
fast = "speed >= 7"
cheap = "cost <= 3"
smart = "instruction_following >= 8"

# OpenAI GPT-5.2
[models.gpt5]
provider = "openai"
model_id = "gpt-5.2"
api_key = "$OPENAI_API_KEY"  # Environment variable reference
enabled = true

[models.gpt5.attributes]
context_window = 128000
cost = 8
speed = 6
instruction_following = 9
functions = true
reasoning = true
local = false

# Anthropic Claude 3.5 Sonnet
[models.claude]
provider = "anthropic"
model_id = "claude-3-5-sonnet-20241022"
api_key = "$ANTHROPIC_API_KEY"
enabled = true

[models.claude.attributes]
context_window = 200000
cost = 6
speed = 7
instruction_following = 9
functions = true
reasoning = true
local = false

# Local Ollama
[models.llama3]
provider = "ollama"
model_id = "llama3:8b"
base_url = "http://localhost:11434"
enabled = true

[models.llama3.attributes]
context_window = 8192
cost = 0
speed = 8
instruction_following = 6
functions = false
reasoning = false
local = true
```

### Environment Variables

Use `$VAR` or `${VAR}` syntax in config values to reference environment variables:

```toml
api_key = "$OPENAI_API_KEY"
base_url = "${CUSTOM_BASE_URL}"
```

## Query Syntax

Queries are comma-separated conditions combined with AND logic.

| Type | Example | Description |
|------|---------|-------------|
| Boolean | `local` | Attribute must be `true` |
| Negated | `!local` | Attribute must be `false` |
| Comparison | `cost <= 5` | Supports `>`, `>=`, `<`, `<=`, `=`, `!=` |
| Equality | `provider = openai` | String comparison |
| Alias | `fast, cheap` | Expands to defined expression |
| Weighted | `local:10, fast:5` | Custom priority weights |

### Position-Based Weighting

By default, earlier conditions get higher weights. The query `"fast, cheap, functions"` prioritizes speed over cost, and cost over function support.

Override with explicit weights when needed:

```typescript
// Cost is most important, then speed
const model = await selectModel("cheap:10, fast:5");
```

## API Reference

### selectModel(query, options?)

Select the single best matching model.

```typescript
// Simple usage
const model = await selectModel("fast, cheap");

// With detailed result
const result = await selectModel("local, functions", { detailed: true });
console.log(result.score);              // 0.85
console.log(result.exactMatch);         // false
console.log(result.matchedAttributes);  // ['local']
console.log(result.missingAttributes);  // ['functions']
```

### selectModels(query, options?)

Select multiple models ranked by match score. Useful for fallback scenarios.

```typescript
const models = await selectModels("local, reasoning", { count: 3 });

for (const model of models) {
  try {
    const { text } = await generateText({ model, prompt: 'Hello!' });
    return text; // Success
  } catch (e) {
    continue; // Try next model
  }
}
```

### selectModelsDetailed(query, options?)

Like `selectModels` but returns detailed results with metadata.

```typescript
const results = await selectModelsDetailed("fast", { count: 3 });

for (const { model, modelName, score, exactMatch } of results) {
  console.log(`${modelName}: score=${score}, exact=${exactMatch}`);
}
```

### Options

```typescript
interface SelectOptions {
  detailed?: boolean;   // Include match metadata in result
  count?: number;       // Number of models to return (for selectModels)
  configPath?: string;  // Custom config file path
}
```

### SelectionResult

When using `detailed: true`:

```typescript
interface SelectionResult<T> {
  model: T;                      // The LanguageModel instance
  config: ModelConfig;           // Model configuration
  modelName: string;             // Model identifier from config
  score: number;                 // Normalized score (0-1)
  exactMatch: boolean;           // All conditions satisfied?
  matchedAttributes: string[];   // Attributes that matched
  missingAttributes: string[];   // Attributes that didn't match
}
```

### Utility Functions

```typescript
import { loadConfig, parseQuery, matchModel } from 'model-selector';

// Load configuration manually
const config = loadConfig('./custom-config.toml');

// Parse a query string
const parsed = parseQuery("fast, cheap", config.aliases);

// Match against model attributes
const result = matchModel(modelAttributes, parsed);
```

## Supported Providers

| Provider | Package | Models |
|----------|---------|--------|
| `openai` | `@ai-sdk/openai` | GPT-5.2, etc. |
| `anthropic` | `@ai-sdk/anthropic` | Claude 3.5, Claude 3, etc. |
| `google` | `@ai-sdk/google` | Gemini Pro, Gemini Flash, etc. |
| `mistral` | `@ai-sdk/mistral` | Mistral Large, Medium, etc. |
| `groq` | `@ai-sdk/groq` | Llama, Mixtral on Groq |
| `cohere` | `@ai-sdk/cohere` | Command R, Command R+ |
| `azure` | `@ai-sdk/azure` | Azure-hosted OpenAI models |
| `ollama` | `ollama-ai-provider` | Any local Ollama model |

## Examples

### Custom Config Path

```typescript
const model = await selectModel("fast", {
  configPath: './configs/production.toml'
});
```

### Debugging Selection

```typescript
const result = await selectModel("local, functions, reasoning", {
  detailed: true
});

if (!result.exactMatch) {
  console.log('No exact match found');
  console.log('Missing:', result.missingAttributes);
  console.log('Score:', result.score);
}
```

### Fallback Chain

```typescript
import { selectModels } from 'model-selector';
import { generateText } from 'ai';

async function generateWithFallback(prompt: string) {
  const models = await selectModels("smart, functions", { count: 3 });

  for (const model of models) {
    try {
      const { text } = await generateText({ model, prompt });
      return text;
    } catch (error) {
      console.log('Model failed, trying next...');
    }
  }

  throw new Error('All models failed');
}
```

## Configuration Utility

A browser-based configuration editor is included for managing your models and aliases.

```bash
# Clone the repo and install dependencies
npm install

# Launch the config editor
npm run config
```

This opens a web UI at `http://localhost:5173` for editing your user config at `~/.config/model-selector/config.toml`.

## React Components

For building custom configuration UIs in your own React app, model-selector exports a set of React components and hooks.

```bash
npm install model-selector react
```

```tsx
import { ConfigProvider, ModelList, ModelForm } from 'model-selector/react';

function MyConfigUI() {
  return (
    <ConfigProvider configPath="./model-selector.toml">
      <ModelList onSelectModel={(name) => console.log(name)} />
    </ConfigProvider>
  );
}
```

See [src/react/README.md](src/react/README.md) for full documentation on available components and hooks.

## License

MIT
