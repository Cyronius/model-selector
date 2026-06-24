# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A monorepo for **model-selector**: query-based runtime LLM model selection. The
host supplies the models it has access to plus a query; model-selector does *only
the match* and returns the selected model id(s) + match metadata. **It never
instantiates an LLM client.** Two implementations:

- `packages/model-selector-py/` — **primary** Python package (zero required deps;
  HuggingFace sync is an optional extra).
- `packages/model-selector-ts/` — reworked TypeScript, match-only (the old React
  UI, REST server, AI-SDK provider factory, and generate/stream wrapper are gone).

`shared/` holds the cross-implementation `corpus/` (golden parse + match cases),
`schema/` (store TOML schema + example), and `spec/spec.md` (the authoritative
contract, requirement prefix `MSEL`).

### Data flow
```
query string → parse_query() → match_model() → rank_models() → model id(s) + MatchResult
```
(plus, Python only) HF sync: `fetch_hf_metadata` → `map_hf_to_facts` →
`derive_attributes` → `merge_attributes`.

## Build & test commands

Python (`packages/model-selector-py/`):
- `pip install -e .[dev]` — install with test deps
- `pytest` — unit + mocked integration (network tests skipped by default)
- `pytest -m network` — opt-in live HuggingFace smoke test

TypeScript (`packages/model-selector-ts/`):
- `npm install`
- `npm run test:run` — run tests once (Vitest)
- `npm run build` / `npm run typecheck`

Shared:
- `python shared/corpus/generate.py` — regenerate the golden corpus from the
  Python implementation after any parse/match behavior change. Both suites assert
  against it, so regenerate + re-run both whenever behavior changes intentionally.

## Core components (mirrored across both packages)

- **Query parser** — comma-separated AND conditions; boolean (`local`, `!local`),
  comparisons (`cost <= 5`), equality (`provider = openai`), custom weights
  (`fast:10`); aliases expanded before parsing; earlier conditions weigh more.
- **Matcher** — type-strict (`bool` ≠ number); numeric comparisons only when both
  sides numeric; missing attribute fails unless negated. Scoring: `score` = sum of
  matched weights, `max_score` = sum of all weights, `normalized_score` = ratio,
  `exact_match` = `score == max_score`.
- **Select** — `rank_models` (stable sort by normalized score desc),
  `select_model`, `select_models`.

Python-only:
- **Stores** (`store/`) — `InMemoryStore`, `JSONMetadataStore`, `TomlMetadataStore`
  implement the `MetadataStore` protocol. Default selection is stateless
  (return-to-caller); stores are for hosts that want a file.
- **Sync + derivation** (`sync/`) — HF facts → crude normalized 1-10 attributes.
  Merge precedence **user > huggingface > derived**; every value carries
  provenance. Subjective fields are never clobbered by a re-sync; factual fields
  refresh only with `overwrite_factual=True`.

## Key patterns

- **Match-only contract.** Never add client instantiation. Selection returns ids.
- **The corpus is the source of behavioral truth.** Don't let the two matchers
  drift — change behavior in one, regenerate the corpus, confirm both suites pass.
- **Derived metadata is overridable and audited.** Heuristics live in a swappable
  `DerivationProfile`; provenance distinguishes user / huggingface / derived.
- **Position-based query weighting**: first condition = highest priority unless an
  explicit `:N` weight is given.
- **Graceful degradation**: returns best partial match unless `require_match`.
