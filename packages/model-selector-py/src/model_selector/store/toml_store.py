"""TOML file store.

Reading uses the stdlib ``tomllib`` (Python 3.11+). Writing requires the
optional ``tomli-w`` extra (``pip install model-selector[toml]``), lazy-imported
with a friendly error if absent.
"""

from __future__ import annotations

import tomllib
from pathlib import Path

from ..errors import StoreError
from ..models import ModelEntry, ModelRegistry
from ._serde import mapping_to_registry, registry_to_mapping


class TomlMetadataStore:
    """Persist a registry as TOML mirroring the legacy config schema.

    Implements :class:`MetadataStore`.
    """

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)

    def load(self) -> ModelRegistry:
        if not self.path.exists():
            return ModelRegistry()
        with self.path.open("rb") as fh:
            data = tomllib.load(fh)
        return mapping_to_registry(data)

    def save(self, registry: ModelRegistry) -> None:
        try:
            import tomli_w
        except ImportError as exc:  # pragma: no cover - exercised via extra
            raise StoreError(
                "Writing TOML requires the 'toml' extra: pip install model-selector[toml]"
            ) from exc

        self.path.parent.mkdir(parents=True, exist_ok=True)
        mapping = registry_to_mapping(registry)
        with self.path.open("wb") as fh:
            tomli_w.dump(mapping, fh)

    def upsert(self, entry: ModelEntry) -> None:
        registry = self.load()
        kept = tuple(e for e in registry.entries if e.id != entry.id)
        self.save(ModelRegistry(entries=kept + (entry,), aliases=registry.aliases))

    def all(self) -> tuple[ModelEntry, ...]:
        return self.load().entries
