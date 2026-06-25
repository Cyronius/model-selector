"""Generate the golden corpus from the (validated) Python implementation.

The corpus is the single source of behavioral truth: both the Python and TS
matchers load it in their test suites and assert identical parse + match results,
so the two implementations cannot silently drift.

Run from the repo root:  python shared/corpus/generate.py
"""

from __future__ import annotations

import json
import sys
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "packages" / "model-selector-py" / "src"))

from model_selector import match_model, parse_query  # noqa: E402
from model_selector.errors import QueryParseError  # noqa: E402

HERE = Path(__file__).resolve().parent

# --- model fixtures (shared by match cases) --------------------------------
# Synthetic models give small, hand-tuned cases; real models (loaded below) come
# from frozen HuggingFace snapshots via ingest_hf.py and exercise matching over
# realistic derived attributes.
MODELS = {
    "gpt4": {
        "context_window": 128000,
        "cost": 8,
        "speed": 6,
        "functions": True,
        "local": False,
        "provider": "openai",
    },
    "gpt4mini": {
        "context_window": 128000,
        "cost": 2,
        "speed": 9,
        "functions": True,
        "local": False,
        "provider": "openai",
    },
    "llama3": {
        "context_window": 8192,
        "cost": 0,
        "speed": 7,
        "functions": False,
        "local": True,
        "provider": "ollama",
    },
}

# (query, aliases) pairs exercised for parsing.
PARSE_QUERIES = [
    ("local", {}),
    ("!local", {}),
    ("local, functions, reasoning", {}),
    ("context_window >= 32000", {}),
    ("cost <= 5", {}),
    ("speed > 7", {}),
    ("cost < 3", {}),
    ("context_window >= 100000", {}),
    ("provider = openai", {}),
    ("provider != google", {}),
    ('provider = "openai"', {}),
    ("local, context_window >= 32000, functions", {}),
    ("cost <= 5, speed >= 7, functions, !local", {}),
    ("first, second, third", {}),
    ("cheap:10, fast:5, local:3", {}),
    ("fast", {"fast": "speed >= 7"}),
    ("fast, cheap", {"fast": "speed >= 7", "cheap": "cost <= 3"}),
]

PARSE_ERRORS = ["", "123invalid"]


def _load_real_models() -> dict[str, dict]:
    """Real models from ingest_hf.py, flattened to matchable attribute bags.

    ``provider`` is a top-level field on the enriched entry; fold it into the
    attribute bag (mirroring select._effective_attributes) so ``provider = ...``
    queries work in the per-model corpus cases. Returns {} if not yet ingested.
    """
    path = HERE / "models.json"
    if not path.exists():
        return {}
    doc = json.loads(path.read_text(encoding="utf-8"))
    models: dict[str, dict] = {}
    for model_id, entry in doc["models"].items():
        attrs = dict(entry["attributes"])
        provider = entry.get("provider")
        if provider is not None and "provider" not in attrs:
            attrs["provider"] = provider
        models[model_id] = attrs
    return models


REAL_MODELS = _load_real_models()

MATCH_QUERIES = [
    ("local", {}),
    ("!local", {}),
    ("functions", {}),
    ("!local, functions", {}),
    ("context_window >= 32000", {}),
    ("context_window >= 100000", {}),
    ("cost <= 3", {}),
    ("speed >= 8", {}),
    ("cost = 0", {}),
    ("cost <= 5, speed >= 7, functions", {}),
    ("local, cost <= 1", {}),
    ("cost <= 3, context_window >= 100000", {}),
    ("local, context_window >= 100000", {}),
    ("local, functions, speed >= 7", {}),
    ("functions:10, local:1", {}),
    ("provider = openai", {}),
    ("provider != google", {}),
    ("reasoning", {}),
    ("!reasoning", {}),
    ("cheap, fast", {"cheap": "cost <= 3", "fast": "speed >= 7"}),
]

# Queries exercised against the real (HF-derived) models only. Chosen to discriminate
# across the ingested set: long-context, MoE active-param size, popularity-derived
# quality, provider filters, and aliases.
REAL_MATCH_QUERIES = [
    ("local", {}),
    ("context_window >= 100000", {}),
    ("context_window >= 32000, cost <= 4", {}),
    ("quality >= 8", {}),
    ("params_active < 20000000000", {}),
    ("cost <= 4, speed >= 6", {}),
    ("provider = qwen", {}),
    ("provider != meta", {}),
    ("cheap, fast", {"cheap": "cost <= 3", "fast": "speed >= 7"}),
]


def build_parse_cases() -> list[dict]:
    cases = []
    for query, aliases in PARSE_QUERIES:
        parsed = parse_query(query, aliases)
        cases.append(
            {
                "query": query,
                "aliases": aliases,
                "conditions": [asdict(c) for c in parsed.conditions],
            }
        )
    for query in PARSE_ERRORS:
        try:
            parse_query(query)
        except QueryParseError:
            cases.append({"query": query, "aliases": {}, "error": True})
        else:  # pragma: no cover
            raise SystemExit(f"expected parse error for {query!r}")
    return cases


def _cases_for(queries: list, models: dict[str, dict]) -> list[dict]:
    cases = []
    for query, aliases in queries:
        parsed = parse_query(query, aliases)
        for model_id, attrs in models.items():
            result = match_model(model_id, attrs, parsed)
            expected = asdict(result)
            expected["matched_attributes"] = list(expected["matched_attributes"])
            expected["missing_attributes"] = list(expected["missing_attributes"])
            cases.append(
                {
                    "query": query,
                    "aliases": aliases,
                    "model": model_id,
                    "expected": expected,
                }
            )
    return cases


def build_match_cases() -> list[dict]:
    # Synthetic queries over synthetic models (kept stable), plus real queries over
    # the HF-derived models. Both share one ``models`` table in match.json.
    return _cases_for(MATCH_QUERIES, MODELS) + _cases_for(REAL_MATCH_QUERIES, REAL_MODELS)


def main() -> None:
    parse_doc = {
        "_comment": "Generated by shared/corpus/generate.py — do not hand-edit.",
        "cases": build_parse_cases(),
    }
    match_doc = {
        "_comment": "Generated by shared/corpus/generate.py — do not hand-edit.",
        "models": {**MODELS, **REAL_MODELS},
        "cases": build_match_cases(),
    }
    (HERE / "parse.json").write_text(json.dumps(parse_doc, indent=2) + "\n", encoding="utf-8")
    (HERE / "match.json").write_text(json.dumps(match_doc, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(parse_doc['cases'])} parse cases, {len(match_doc['cases'])} match cases")


if __name__ == "__main__":
    main()
