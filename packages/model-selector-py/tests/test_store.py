import pytest

from model_selector import (
    InMemoryStore,
    JSONMetadataStore,
    ModelEntry,
    ModelRegistry,
    TomlMetadataStore,
)

ENTRY = ModelEntry(
    id="llama",
    provider="ollama",
    attributes={"cost": 3, "local": True, "params_total": 8_000_000_000},
    provenance={"cost": "derived", "local": "huggingface"},
    hf_repo_id="meta-llama/Llama-3.1-8B-Instruct",
)


def test_in_memory_roundtrip():
    store = InMemoryStore(aliases={"cheap": "cost <= 3"})
    store.upsert(ENTRY)
    reg = store.load()
    assert reg.get("llama") == ENTRY
    assert reg.aliases == {"cheap": "cost <= 3"}


def test_in_memory_upsert_replaces():
    store = InMemoryStore()
    store.upsert(ENTRY)
    updated = ModelEntry(id="llama", attributes={"cost": 5})
    store.upsert(updated)
    assert len(store.all()) == 1
    assert store.load().get("llama").attributes["cost"] == 5


def test_json_roundtrip(tmp_path):
    store = JSONMetadataStore(tmp_path / "models.json")
    registry = ModelRegistry(entries=(ENTRY,), aliases={"fast": "speed >= 7"})
    store.save(registry)
    loaded = store.load()
    assert loaded.get("llama") == ENTRY
    assert loaded.aliases == {"fast": "speed >= 7"}


def test_json_missing_file_returns_empty(tmp_path):
    store = JSONMetadataStore(tmp_path / "nope.json")
    assert store.load().entries == ()


def test_json_upsert(tmp_path):
    store = JSONMetadataStore(tmp_path / "m.json")
    store.upsert(ENTRY)
    store.upsert(ModelEntry(id="gpt5", attributes={"cost": 8}))
    assert {e.id for e in store.all()} == {"llama", "gpt5"}


def test_toml_roundtrip(tmp_path):
    pytest.importorskip("tomli_w")
    store = TomlMetadataStore(tmp_path / "models.toml")
    registry = ModelRegistry(entries=(ENTRY,), aliases={"cheap": "cost <= 3"})
    store.save(registry)
    loaded = store.load()
    assert loaded.get("llama") == ENTRY
    assert loaded.aliases == {"cheap": "cost <= 3"}


def test_toml_matches_legacy_schema(tmp_path):
    pytest.importorskip("tomli_w")
    import tomllib

    path = tmp_path / "models.toml"
    store = TomlMetadataStore(path)
    store.save(ModelRegistry(entries=(ENTRY,), aliases={"cheap": "cost <= 3"}))
    data = tomllib.loads(path.read_text(encoding="utf-8"))
    assert "aliases" in data
    assert "llama" in data["models"]
    assert data["models"]["llama"]["attributes"]["local"] is True
