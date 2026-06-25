"""Real popular-model coverage, driven by frozen HuggingFace snapshots.

Snapshots live in ``shared/corpus/hf_raw/`` and the enriched registry in
``shared/corpus/models.json``; both are produced by ``shared/corpus/ingest_hf.py``.
These tests replay the frozen snapshots through the real enrichment pipeline (no
network) and assert the derived attributes are sane, then exercise selection over
the realistic registry.

Traces:
  MSEL-HF-FACTS  — map_hf_to_facts (params_active MoE adjustment, factual mapping)
  MSEL-DERIVE    — derive_attributes (1-10 bounds, MoE faster than dense-same-total)
  MSEL-MERGE     — merge_attributes (provenance: huggingface vs derived)
  MSEL-SYNC      — enrich_entry pipeline parity with the frozen registry
  MSEL-SELECT-RANK — rank_models/select_model over real models
"""

import json

import pytest

from conftest import CORPUS_DIR
from model_selector import (
    ModelEntry,
    ModelRegistry,
    enrich_entry,
    map_hf_to_facts,
    rank_models,
    select_model,
    select_models,
)
from model_selector.sync.derive import default_speed

RAW_DIR = CORPUS_DIR / "hf_raw"
REGISTRY_DOC = json.loads((CORPUS_DIR / "models.json").read_text(encoding="utf-8"))
MODELS = REGISTRY_DOC["models"]

# MoE models in the ingested set (params_active should drop below params_total).
MOE_IDS = {"mixtral-8x7b", "deepseek-v3", "kimi-k2"}
DERIVED_FIELDS = ("quality", "speed", "cost")


def _snapshot(model_id: str) -> dict:
    return json.loads((RAW_DIR / f"{model_id}.json").read_text(encoding="utf-8"))


def _entry(model_id: str) -> ModelEntry:
    m = MODELS[model_id]
    return ModelEntry(id=model_id, provider=m["provider"], hf_repo_id=m["hf_repo_id"])


ALL_IDS = sorted(MODELS)


def test_fixtures_exist():
    assert MODELS, "models.json is empty — run shared/corpus/ingest_hf.py"
    for model_id in MODELS:
        assert (RAW_DIR / f"{model_id}.json").exists(), f"missing snapshot for {model_id}"


@pytest.mark.parametrize("model_id", ALL_IDS)
def test_enrich_matches_frozen_registry(model_id):
    """enrich_entry over the frozen snapshot reproduces models.json exactly.

    This pins the registry both suites consume to the real pipeline output, so the
    fixtures cannot drift from the code that generated them.
    """
    snapshot = _snapshot(model_id)
    enriched = enrich_entry(_entry(model_id), fetch=lambda *_a, _s=snapshot: _s)
    expected = MODELS[model_id]
    assert dict(enriched.attributes) == expected["attributes"]
    assert dict(enriched.provenance) == expected["provenance"]


@pytest.mark.parametrize("model_id", ALL_IDS)
def test_provenance_split(model_id):
    prov = MODELS[model_id]["provenance"]
    for field in DERIVED_FIELDS:
        assert prov.get(field) == "derived"
    # Anything HF-sourced is tagged huggingface, never user, on a fresh sync.
    factual = set(prov) - set(DERIVED_FIELDS)
    assert factual, f"{model_id} has no factual attributes"
    assert all(prov[k] == "huggingface" for k in factual)


@pytest.mark.parametrize("model_id", ALL_IDS)
def test_derived_within_bounds(model_id):
    attrs = MODELS[model_id]["attributes"]
    for field in DERIVED_FIELDS:
        assert field in attrs, f"{model_id} missing derived {field}"
        assert 1 <= attrs[field] <= 10


@pytest.mark.parametrize("model_id", sorted(MOE_IDS))
def test_moe_active_below_total_and_faster(model_id):
    """MoE active params < total, and the adjustment makes it faster than a dense
    model of the same *total* size (MSEL-DERIVE intent)."""
    facts = map_hf_to_facts(_snapshot(model_id))
    assert facts["params_active"] < facts["params_total"]
    dense_speed = default_speed({"params_active": facts["params_total"]})
    assert MODELS[model_id]["attributes"]["speed"] > dense_speed


@pytest.mark.parametrize("model_id", sorted(set(ALL_IDS) - MOE_IDS))
def test_dense_active_equals_total(model_id):
    facts = map_hf_to_facts(_snapshot(model_id))
    assert facts["params_active"] == facts["params_total"]


def test_larger_dense_scores_higher_quality_lower_speed():
    """A 70B dense model should out-quality and under-speed a 7B one."""
    big = MODELS["qwen2.5-72b"]["attributes"]
    small = MODELS["qwen2.5-7b"]["attributes"]
    assert big["quality"] > small["quality"]
    assert big["speed"] < small["speed"]


def test_spot_facts_qwen():
    facts = map_hf_to_facts(_snapshot("qwen2.5-7b"))
    assert facts["architecture"] == "qwen2"
    assert facts["license"] == "apache-2.0"
    assert facts["context_window"] == 32768
    assert facts["gated"] is False
    assert facts["local"] is True


def test_mixtral_active_param_formula():
    # 8 experts, 2 per token, no shared experts -> a quarter of total.
    facts = map_hf_to_facts(_snapshot("mixtral-8x7b"))
    assert facts["params_active"] == int(facts["params_total"] * 2 / 8)


# --- selection over the real registry --------------------------------------

REGISTRY = ModelRegistry.from_models(
    [{"id": mid, **MODELS[mid]} for mid in MODELS],
    aliases={"cheap": "cost <= 3", "fast": "speed >= 7"},
)


def _matched_ids(query: str) -> set[str]:
    return {r.model_id for r in select_models(query, REGISTRY, count=len(MODELS), require_match=True)}


def test_long_context_selection():
    # Only phi / deepseek / kimi exceed 100k; gated models have no context_window.
    assert _matched_ids("context_window >= 100000") == {"phi-3.5-mini", "deepseek-v3", "kimi-k2"}


def test_high_quality_selection():
    assert _matched_ids("quality >= 9") == {"deepseek-v3", "kimi-k2"}


def test_provider_filter():
    assert _matched_ids("provider = qwen") == {"qwen2.5-7b", "qwen2.5-72b"}


def test_cheap_and_fast_unique_winner():
    best = select_model("cheap, fast", REGISTRY, require_match=True)
    assert best is not None and best.model_id == "phi-3.5-mini"
    assert best.exact_match


def test_quality_query_ranks_moe_above_small():
    ranked = [r.model_id for r in rank_models("quality >= 8", REGISTRY)]
    assert ranked.index("deepseek-v3") < ranked.index("phi-3.5-mini")
