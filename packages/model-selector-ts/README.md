# model-selector (TypeScript)

Query-based runtime LLM model selection. **Match-only**: the host supplies the
models it has access to plus a query string; model-selector does *only the match*
and returns the selected model id(s) + match metadata. It never instantiates an
LLM client.

## Install

```bash
npm install model-selector
```

ESM only (`"type": "module"`).

## Query DSL

Comma-separated conditions, AND logic. First condition has the highest weight
unless overridden with `:N`.

| Form | Example |
|------|---------|
| boolean | `local`, `functions` |
| negated | `!local` |
| comparison | `cost <= 5`, `speed >= 7`, `context_window >= 32000` |
| equality | `provider = openai`, `provider != google` |
| custom weight | `fast:10, cheap:5` |
| alias | `cheap` → `cost <= 3` (via `aliases`) |

## Selection API

```typescript
parseQuery(query, aliases?) : ParsedQuery
matchModel(attributes, parsed) : MatchResult
normalizeScore(result) : number
rankModels(query, config) : Selection[]               // inline config, no file
selectModel(query, options?) : Selection | null       // loads a TOML config
selectModels(query, options?) : Selection[]           // loads a TOML config
```

`Selection` carries `modelId`, `config`, `score`, `matches`, `exactMatch`,
`matchedAttributes`, `missingAttributes`. Config loading helpers live under
`model-selector/config`.

## Example

[`examples/openai-demo.ts`](examples/openai-demo.ts) runs the full loop — define
3 OpenAI models inline, query, select, then (optionally) call OpenAI with the
chosen id:

```bash
npm install
npx tsx examples/openai-demo.ts             # selection only
npm install openai                          # add openai to close the loop
export OPENAI_API_KEY=sk-... && npm run example
```

## Tests

```bash
npm run test:run      # Vitest
npm run typecheck
```
