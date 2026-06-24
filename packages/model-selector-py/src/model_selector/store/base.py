"""The MetadataStore protocol."""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from ..models import ModelEntry, ModelRegistry


@runtime_checkable
class MetadataStore(Protocol):
    """A persistence backend for an enriched model registry."""

    def load(self) -> ModelRegistry:
        """Load the full registry. Returns an empty registry if nothing is stored."""
        ...

    def save(self, registry: ModelRegistry) -> None:
        """Persist the full registry, replacing prior contents."""
        ...

    def upsert(self, entry: ModelEntry) -> None:
        """Insert or replace a single entry by id."""
        ...

    def all(self) -> tuple[ModelEntry, ...]:
        """Return all stored entries."""
        ...
