"""JSON file store."""

from __future__ import annotations

import json
from pathlib import Path

from ..models import ModelEntry, ModelRegistry
from ._serde import mapping_to_registry, registry_to_mapping


class JSONMetadataStore:
    """Persist a registry as a JSON file. Implements :class:`MetadataStore`."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def load(self) -> ModelRegistry:
        if not self.path.exists():
            return ModelRegistry()
        data = json.loads(self.path.read_text(encoding="utf-8"))
        return mapping_to_registry(data)

    def save(self, registry: ModelRegistry) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        mapping = registry_to_mapping(registry)
        self.path.write_text(
            json.dumps(mapping, indent=2, sort_keys=True), encoding="utf-8"
        )

    def upsert(self, entry: ModelEntry) -> None:
        registry = self.load()
        kept = tuple(e for e in registry.entries if e.id != entry.id)
        self.save(ModelRegistry(entries=kept + (entry,), aliases=registry.aliases))

    def all(self) -> tuple[ModelEntry, ...]:
        return self.load().entries
