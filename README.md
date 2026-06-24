# model-selector

Query-based runtime LLM model selection.

Instead of hardcoding which model to use, the host supplies the list of models it
has access to plus a query like `"fast, cheap, functions"`, and model-selector
returns the **selected model id(s) + match metadata**. It does *only the match* —
it never instantiates an LLM client. The host owns its models and its clients.

```
query string ──▶ parse ──▶ match (weighted attributes) ──▶ rank ──▶ model id(s) + metadata
```

## Monorepo layout

```
packages/
  model-selector-py/    PRIMARY — Python package (where this is actually needed)
  model-selector-ts/    reworked TypeScript — match-only (UX/server/wrapper/providers removed)
shared/
  corpus/               golden cases: query -> ParsedQuery -> MatchResult (JSON)
  schema/               store TOML schema + example config
  spec/                 the contract both implementations satisfy (spec.md)
```

Both packages load `shared/corpus/*.json` in their test suites and assert
identical parse + match results, so the two matchers cannot silently drift. The
corpus is regenerated from the Python implementation via
`shared/corpus/generate.py`.

## The contract

1. **Match-only.** No UX, no server, no client creation. The host hands us models
   + a query; we return ids + match metadata.
2. **Metadata is (mostly) automatic.** HuggingFace is the source of truth for
   *factual* open-weight metadata (params, context window, license, tags,
   popularity). It exposes nothing for cost / speed / quality, and proprietary
   models (Claude, GPT) aren't on the Hub. So the Python package derives crude
   normalized 1-10 attributes from HF facts and lets the host override anything —
   with precedence **user > huggingface > derived** and full provenance tracking.

## Python (primary)

```python
from model_selector import select_model, ModelRegistry

registry = ModelRegistry.from_models(
    [
        {"id": "gpt5",  "attributes": {"cost": 8, "speed": 6, "functions": True}},
        {"id": "haiku", "attributes": {"cost": 2, "speed": 9, "functions": True}},
    ],
    aliases={"cheap": "cost <= 3", "fast": "speed >= 7"},
)
res = select_model("cheap, fast, functions", registry)
client = host_make_client(res.model_id)  # client creation stays the host's job
```

See [packages/model-selector-py/README.md](packages/model-selector-py/README.md).

## TypeScript

```typescript
import { selectModel } from 'model-selector';

const sel = selectModel('fast, cheap, functions');   // reads a TOML config
if (sel) {
  const client = hostMakeClient(sel.modelId);        // host's job
}
```

See [packages/model-selector-ts/src/index.ts](packages/model-selector-ts/src/index.ts).

## Query DSL

Comma-separated conditions (AND), first has highest weight unless overridden:

| Form | Example |
|------|---------|
| boolean | `local`, `functions` |
| negated | `!local` |
| comparison | `cost <= 5`, `speed >= 7` |
| equality | `provider = openai`, `provider != google` |
| custom weight | `fast:10, cheap:5` |
| alias | `cheap` → `cost <= 3` |

## Development

```bash
# Python
cd packages/model-selector-py && pip install -e .[dev] && pytest

# TypeScript
cd packages/model-selector-ts && npm install && npm run test:run

# Regenerate the shared corpus after a behavior change
python shared/corpus/generate.py
```
