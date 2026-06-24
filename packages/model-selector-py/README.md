# model-selector (Python)

Query-based runtime LLM model selection. The host owns its models and its LLM
clients; model-selector **only does the match** and hands back the selected model
id(s) plus match metadata. It never instantiates a client.

```python
from model_selector import select_model, ModelRegistry

registry = ModelRegistry.from_models(
    [
        {"id": "gpt5",  "attributes": {"cost": 8, "speed": 6, "functions": True}},
        {"id": "haiku", "attributes": {"cost": 2, "speed": 9, "functions": True}},
        {"id": "llama", "attributes": {"cost": 0, "speed": 7, "local": True}},
    ],
    aliases={"cheap": "cost <= 3", "fast": "speed >= 7"},
)

res = select_model("cheap, fast, functions", registry)
print(res.model_id)          # "haiku"
print(res.normalized_score)  # 1.0
client = host_make_client(res.model_id)  # client creation stays the host's job
```

## Install

```bash
pip install model-selector                 # pure core, zero deps
pip install model-selector[huggingface]    # + HuggingFace metadata sync
pip install model-selector[toml]           # + TOML store write support
```

Requires Python 3.11+ (stdlib `tomllib`).

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

```python
parse_query(query, aliases=None) -> ParsedQuery
match_model(model_id, attributes, parsed) -> MatchResult
rank_models(query, registry) -> list[MatchResult]
select_model(query, registry, *, require_match=False) -> MatchResult | None
select_models(query, registry, *, count=3, require_match=False) -> list[MatchResult]
select_model_from(query, models, *, aliases=None) -> MatchResult | None  # stateless
```

`MatchResult` carries `model_id`, `matches`, `score`, `max_score`,
`normalized_score`, `exact_match`, `matched_attributes`, `missing_attributes`.

## HuggingFace sync + derivation

HF is treated as the source of truth for **factual** open-weight metadata (params,
context window, license, tags, popularity). It exposes nothing for cost / speed /
quality, and proprietary models (Claude, GPT) are not on the Hub. So we derive
crude normalized 1-10 attributes from the facts and let the host override anything.

```python
from model_selector import sync_models, ModelEntry

enriched = sync_models([
    ModelEntry(id="llama", hf_repo_id="meta-llama/Llama-3.1-8B-Instruct"),
    ModelEntry(id="claude", attributes={"cost": 6, "quality": 9}),  # no repo -> passthrough
])
# enriched[0].attributes now has params_total, context_window (provenance="huggingface")
# and derived speed/quality/cost (provenance="derived").
```

Precedence on merge: **user > huggingface > derived**. Subjective fields
(`cost`, `speed`, `quality`, ...) are never clobbered by a re-sync; factual fields
refresh only with `overwrite_factual=True`.

Pass `store=JSONMetadataStore(path)` (or `TomlMetadataStore`, `InMemoryStore`) to
persist instead of just returning the enriched list.

## Tests

```bash
pip install -e .[dev]
pytest                 # unit + mocked integration
pytest -m network      # opt-in live HuggingFace smoke test
```

The parser/matcher suites assert against the shared golden corpus in
`shared/corpus/`, keeping this implementation in lockstep with the TypeScript one.
