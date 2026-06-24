from model_selector import (
    ModelEntry,
    ModelRegistry,
    rank_models,
    select_model,
    select_model_from,
    select_models,
)

REGISTRY = ModelRegistry.from_models(
    [
        {"id": "gpt5", "provider": "openai", "attributes": {"cost": 8, "speed": 6, "functions": True}},
        {"id": "haiku", "provider": "anthropic", "attributes": {"cost": 2, "speed": 9, "functions": True}},
        {"id": "llama", "provider": "ollama", "attributes": {"cost": 0, "speed": 7, "local": True}},
    ],
    aliases={"cheap": "cost <= 3", "fast": "speed >= 7"},
)


def test_rank_orders_by_score_desc():
    ranked = rank_models("cheap, fast, functions", REGISTRY)
    assert [r.model_id for r in ranked][0] == "haiku"
    scores = [r.normalized_score for r in ranked]
    assert scores == sorted(scores, reverse=True)


def test_select_best():
    res = select_model("cheap, fast, functions", REGISTRY)
    assert res is not None
    assert res.model_id == "haiku"
    assert res.exact_match is True


def test_select_models_topn():
    res = select_models("cheap, fast", REGISTRY, count=2)
    assert len(res) == 2
    assert res[0].model_id in {"haiku", "llama"}


def test_provider_folded_in():
    res = select_model("provider = ollama", REGISTRY)
    assert res is not None and res.model_id == "llama" and res.exact_match is True


def test_require_match_returns_none():
    res = select_model("nonexistent_attr", REGISTRY, require_match=True)
    assert res is None


def test_require_match_off_returns_partial():
    res = select_model("nonexistent_attr", REGISTRY)
    assert res is not None  # best partial match still returned


def test_stable_order_on_tie():
    reg = ModelRegistry.from_models(
        [{"id": "a", "attributes": {}}, {"id": "b", "attributes": {}}]
    )
    ranked = rank_models("local", reg)  # both score 0 -> stable registry order
    assert [r.model_id for r in ranked] == ["a", "b"]


def test_select_model_from_convenience():
    res = select_model_from(
        "cheap",
        [{"id": "x", "attributes": {"cost": 1}}, {"id": "y", "attributes": {"cost": 9}}],
        aliases={"cheap": "cost <= 3"},
    )
    assert res is not None and res.model_id == "x"


def test_empty_registry_returns_none():
    assert select_model("anything", ModelRegistry()) is None


def test_coerce_modelentry_passthrough():
    e = ModelEntry(id="z", attributes={"cost": 1})
    reg = ModelRegistry.from_models([e])
    assert reg.entries[0] is e
