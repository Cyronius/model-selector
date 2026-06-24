import pytest

from model_selector import (
    InMemoryStore,
    ModelEntry,
    enrich_entry,
    fetch_hf_metadata,
    map_hf_to_facts,
    sync_models,
)
from model_selector.errors import SyncError

LLAMA_RAW = {
    "id": "meta-llama/Llama-3.1-8B-Instruct",
    "downloads": 2_000_000,
    "likes": 3000,
    "created_at": "2024-07-23T00:00:00+00:00",
    "gated": "manual",
    "tags": ["text-generation", "conversational"],
    "pipeline_tag": "text-generation",
    "card_data": {"license": "llama3.1"},
    "config": {"model_type": "llama", "max_position_embeddings": 131072},
    "safetensors": {"total": 8_030_000_000},
}

MIXTRAL_RAW = {
    "id": "mistralai/Mixtral-8x7B-Instruct-v0.1",
    "downloads": 500_000,
    "gated": False,
    "tags": ["text-generation"],
    "pipeline_tag": "text-generation",
    "card_data": {"license": "apache-2.0"},
    "config": {
        "model_type": "mixtral",
        "max_position_embeddings": 32768,
        "num_local_experts": 8,
        "num_experts_per_tok": 2,
    },
    "safetensors": {"total": 46_700_000_000},
}

FIXTURES = {
    "meta-llama/Llama-3.1-8B-Instruct": LLAMA_RAW,
    "mistralai/Mixtral-8x7B-Instruct-v0.1": MIXTRAL_RAW,
}


def fake_fetch(repo_id, token=None):
    return FIXTURES[repo_id]


class TestMapHfToFacts:
    def test_llama_facts(self):
        f = map_hf_to_facts(LLAMA_RAW)
        assert f["params_total"] == 8_030_000_000
        assert f["params_active"] == 8_030_000_000  # dense
        assert f["architecture"] == "llama"
        assert f["context_window"] == 131072
        assert f["license"] == "llama3.1"
        assert f["gated"] is True
        assert f["local"] is True
        assert f["downloads"] == 2_000_000

    def test_moe_active_params_below_total(self):
        f = map_hf_to_facts(MIXTRAL_RAW)
        assert f["params_active"] < f["params_total"]
        assert f["params_active"] == int(46_700_000_000 * 2 / 8)

    def test_gated_false(self):
        assert map_hf_to_facts(MIXTRAL_RAW)["gated"] is False


class TestEnrichAndSync:
    def test_enrich_entry(self):
        entry = ModelEntry(id="llama", hf_repo_id="meta-llama/Llama-3.1-8B-Instruct")
        result = enrich_entry(entry, fetch=fake_fetch)
        assert result.attributes["context_window"] == 131072
        assert result.provenance["context_window"] == "huggingface"
        assert "speed" in result.attributes and result.provenance["speed"] == "derived"
        assert "quality" in result.attributes

    def test_proprietary_passes_through(self):
        entry = ModelEntry(id="claude", attributes={"cost": 6, "quality": 9})
        result = enrich_entry(entry, fetch=fake_fetch)
        assert result == entry  # no hf_repo_id -> unchanged

    def test_host_override_survives_sync(self):
        entry = ModelEntry(
            id="llama",
            attributes={"quality": 9},
            provenance={"quality": "user"},
            hf_repo_id="meta-llama/Llama-3.1-8B-Instruct",
        )
        result = enrich_entry(entry, fetch=fake_fetch)
        assert result.attributes["quality"] == 9
        assert result.provenance["quality"] == "user"

    def test_sync_models_returns_list(self):
        entries = [
            {"id": "llama", "hf_repo_id": "meta-llama/Llama-3.1-8B-Instruct"},
            {"id": "claude", "attributes": {"cost": 6}},
        ]
        result = sync_models(entries, fetch=fake_fetch)
        assert [e.id for e in result] == ["llama", "claude"]
        assert "context_window" in result[0].attributes

    def test_sync_models_writes_to_store(self):
        store = InMemoryStore()
        sync_models(
            [{"id": "llama", "hf_repo_id": "meta-llama/Llama-3.1-8B-Instruct"}],
            store=store,
            fetch=fake_fetch,
        )
        assert store.load().get("llama").attributes["architecture"] == "llama"


def test_fetch_without_extra_raises():
    pytest.importorskip
    try:
        import huggingface_hub  # noqa: F401
    except ImportError:
        with pytest.raises(SyncError, match="huggingface"):
            fetch_hf_metadata("meta-llama/Llama-3.1-8B-Instruct")
    else:
        pytest.skip("huggingface_hub installed; extra-missing path not exercised")
