"""Shared (de)serialization between the JSON and TOML file stores.

Both file formats use the same logical shape, mirroring the legacy
``model-selector.example.toml`` schema:

    aliases: {name -> expr}
    models: {id -> {provider?, hf_repo_id?, attributes: {...}, provenance: {...}}}
"""

from __future__ import annotations

from typing import Mapping

from ..models import ModelEntry, ModelRegistry


def registry_to_mapping(registry: ModelRegistry) -> dict[str, object]:
    models: dict[str, object] = {}
    for entry in registry.entries:
        model: dict[str, object] = {}
        if entry.provider is not None:
            model["provider"] = entry.provider
        if entry.hf_repo_id is not None:
            model["hf_repo_id"] = entry.hf_repo_id
        model["attributes"] = dict(entry.attributes)
        if entry.provenance:
            model["provenance"] = dict(entry.provenance)
        models[entry.id] = model
    return {"aliases": dict(registry.aliases), "models": models}


def mapping_to_registry(data: Mapping[str, object]) -> ModelRegistry:
    aliases = dict(data.get("aliases") or {})
    raw_models = data.get("models") or {}
    entries: list[ModelEntry] = []
    for model_id, raw in raw_models.items():
        raw = raw or {}
        entries.append(
            ModelEntry(
                id=str(model_id),
                provider=raw.get("provider"),
                attributes=dict(raw.get("attributes") or {}),
                provenance=dict(raw.get("provenance") or {}),
                hf_repo_id=raw.get("hf_repo_id"),
            )
        )
    return ModelRegistry(entries=tuple(entries), aliases=aliases)
