# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

- `npm run build` - Compile TypeScript to dist/
- `npm test` - Run tests in watch mode (Vitest)
- `npm run test:run` - Run tests once (for CI)
- `npm run lint` - Run ESLint on src/
- `npm run typecheck` - Type check without emitting

## Architecture

Model-selector is a TypeScript library for runtime LLM model selection using query-based matching with Vercel AI SDK.

### Data Flow
```
Query string → parseQuery() → matchModel() → rankModels() → createLanguageModel() → LanguageModel
```

### Core Components

**Config Loader** (`src/config/loader.ts`)
- Loads TOML configs from: `~/.config/model-selector/config.toml` → `./model-selector.toml` → `$MODEL_SELECTOR_CONFIG` → custom path
- Resolves `$VAR` and `${VAR}` environment variable references
- Merges configs with later files overriding earlier ones

**Query Parser** (`src/query/parser.ts`)
- Parses comma-separated queries: `"fast, cheap, functions"`
- Supports: boolean (`local`, `!local`), comparisons (`cost <= 5`), equality (`provider = openai`), custom weights (`fast:10`)
- Expands aliases before parsing
- Earlier conditions get higher weights by default

**Model Matcher** (`src/query/matcher.ts`)
- Scores models against parsed queries
- Returns match metadata: score, matched attributes, missing attributes, exactMatch flag

**Provider Factory** (`src/providers/factory.ts`)
- Dynamic imports of optional peer dependencies (@ai-sdk/openai, @ai-sdk/anthropic, etc.)
- Caches provider factories
- Creates LanguageModel instances from ModelConfig

### Public API (`src/index.ts`)
- `selectModel(query, options)` - Returns single best matching LanguageModel
- `selectModels(query, options)` - Returns ranked array for fallbacks
- `selectModelDetailed()` / `selectModelsDetailed()` - Include match metadata

## Configuration

Models defined in TOML (see `model-selector.example.toml`):
```toml
[aliases]
fast = "speed >= 7"

[models.gpt4]
provider = "openai"
model_id = "gpt-4-turbo"
api_key = "$OPENAI_API_KEY"
[models.gpt4.attributes]
speed = 6
cost = 8
```

## Key Patterns

- **Optional peer dependencies**: Users install only needed providers; factory handles missing gracefully
- **Position-based query weighting**: First condition = highest priority unless explicit weights given
- **Graceful degradation**: Returns best partial match if no exact match found
