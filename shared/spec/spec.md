# model-selector — canonical spec

**Feature prefix:** `MSEL`
**Applies to:** model-selector-py, model-selector-ts

model-selector does runtime LLM model selection by matching a query string against
a host-supplied list of models. It returns the selected model id(s) plus match
metadata. **It never instantiates an LLM client** — the host owns its models and
its clients.

The golden corpus in `shared/corpus/` is the executable form of the parse + match
requirements; both implementations assert against it (see `MSEL-CORPUS`).

---

## Query DSL

### MSEL-PARSE-CONDITIONS: Comma-separated AND conditions
**Applies to:** model-selector-py, model-selector-ts
**Test category:** unit

A query is a comma-separated list of conditions combined with AND. Supported forms:
boolean (`local`), negated boolean (`!local`), comparisons (`cost <= 5`,
`speed >= 7`, `>`, `<`), equality / inequality (`provider = openai`,
`provider != google`), and custom weights (`fast:10`).

**Acceptance criteria:**
- `"local"` → one condition `{attribute: local, operator: =, value: true, negated: false}`
- `"cost <= 5"` → `{attribute: cost, operator: <=, value: 5}`
- `'provider = "openai"'` → value `openai` (quotes stripped)
- empty query raises a parse error; `"123invalid"` raises a parse error

### MSEL-PARSE-WEIGHTS: Position-based weighting with override
**Applies to:** model-selector-py, model-selector-ts
**Test category:** unit

Each condition's weight defaults to `total_conditions - position` (first = highest).
A `:N` suffix overrides it.

**Acceptance criteria:**
- `"first, second, third"` → weights `[3, 2, 1]`
- `"cheap:10, fast:5, local:3"` → weights `[10, 5, 3]`

### MSEL-PARSE-ALIASES: Alias expansion before tokenizing
**Applies to:** model-selector-py, model-selector-ts
**Test category:** unit

Aliases map a name to a query expression and are expanded before parsing. A `:N`
weight suffix survives expansion.

**Acceptance criteria:**
- aliases `{fast: "speed >= 7"}`, query `"fast"` → `{attribute: speed, operator: >=, value: 7}`

---

## Matching

### MSEL-MATCH-SCORE: Weighted scoring
**Applies to:** model-selector-py, model-selector-ts
**Test category:** unit

`score` = sum of matched condition weights; `max_score` = sum of all weights;
`normalized_score` = `score / max_score` (0 when `max_score == 0`);
`exact_match` = `score == max_score`; `matches` = `score > 0`.

### MSEL-MATCH-TYPES: Type-strict comparisons
**Applies to:** model-selector-py, model-selector-ts
**Test category:** unit

Equality is type-strict (JS `===` semantics): `bool` is distinct from number.
Numeric comparisons (`>`, `>=`, `<`, `<=`) apply only when both operands are
numeric, and `bool` is **not** numeric.

### MSEL-MATCH-MISSING: Missing attribute handling
**Applies to:** model-selector-py, model-selector-ts
**Test category:** unit

A condition on an attribute the model lacks fails — unless the condition is
negated, in which case it passes.

**Acceptance criteria:**
- model without `reasoning`, query `"reasoning"` → not exact match
- same model, query `"!reasoning"` → exact match

### MSEL-SELECT-RANK: Ranking and selection
**Applies to:** model-selector-py, model-selector-ts
**Test category:** unit

`rank_models` returns all models sorted by `normalized_score` descending (stable).
`select_model` returns the best (or `None` with `require_match` and no match).
`select_models` returns the top-N. Returned results carry the host's own model id.

### MSEL-CORPUS: Cross-implementation equivalence
**Applies to:** model-selector-py, model-selector-ts
**Test category:** unit

Both implementations load `shared/corpus/parse.json` and `shared/corpus/match.json`
and produce identical parse + match results. The corpus is regenerated from the
Python implementation via `shared/corpus/generate.py`.

---

## Metadata sync + derivation (Python first)

### MSEL-HF-FACTS: Map HuggingFace metadata to factual attributes
**Applies to:** model-selector-py
**Test category:** unit

`map_hf_to_facts` (pure) maps raw HF metadata to factual attributes:
`params_total`, `params_active` (= total for dense; MoE-adjusted via
`num_local_experts` / `num_experts_per_tok`), `architecture`, `context_window`,
`license`, `gated`, `pipeline_tag`, `tags`, `downloads`, `likes`, `created_at`,
`local=true`. Provenance is `huggingface`.

### MSEL-DERIVE: Derive normalized 1-10 attributes from facts
**Applies to:** model-selector-py
**Test category:** unit

`derive_attributes` (pure) derives `quality`, `speed`, `cost` (1-10) from facts via
a swappable `DerivationProfile`. Larger models score higher quality, lower speed,
higher cost; MoE active-param adjustment makes MoE faster than a dense model of the
same total size. Models without param facts get no derived values. Provenance is
`derived`.

### MSEL-MERGE: Precedence and provenance
**Applies to:** model-selector-py
**Test category:** unit

`merge_attributes` (pure) applies precedence `user > huggingface > derived`.
Host-authored values always win. Factual values are preserved across a re-sync
unless `overwrite_factual=True`.

### MSEL-SYNC: Sync pipeline
**Applies to:** model-selector-py
**Test category:** integration

`sync_models` runs `fetch_hf_metadata` → `map_hf_to_facts` → `derive_attributes`
→ `merge_attributes` per entry. Entries without `hf_repo_id` pass through
unchanged. Returns the enriched list (return-to-caller); optionally upserts into a
store. HF fetch is mocked in tests; a live call is `network`/manual.

### MSEL-STORE: Persistence
**Applies to:** model-selector-py
**Test category:** unit

`InMemoryStore`, `JSONMetadataStore`, and `TomlMetadataStore` implement the
`MetadataStore` protocol (`load`/`save`/`upsert`/`all`) and round-trip a registry.
The TOML schema mirrors the legacy `[aliases]` / `[models.<id>]` /
`[models.<id>.attributes]` layout.
