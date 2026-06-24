"""In-memory store. The default backing for stateful use within a process."""

from __future__ import annotations

from typing import Mapping

from ..models import ModelEntry, ModelRegistry


class InMemoryStore:
    """Holds a registry in memory. Implements :class:`MetadataStore`."""

    def __init__(
        self,
        registry: ModelRegistry | None = None,
        aliases: Mapping[str, str] | None = None,
    ) -> None:
        if registry is None:
            registry = ModelRegistry(entries=(), aliases=dict(aliases or {}))
        self._entries: dict[str, ModelEntry] = {e.id: e for e in registry.entries}
        self._aliases: dict[str, str] = dict(registry.aliases or aliases or {})

    def load(self) -> ModelRegistry:
        return ModelRegistry(entries=tuple(self._entries.values()), aliases=dict(self._aliases))

    def save(self, registry: ModelRegistry) -> None:
        self._entries = {e.id: e for e in registry.entries}
        self._aliases = dict(registry.aliases)

    def upsert(self, entry: ModelEntry) -> None:
        self._entries[entry.id] = entry

    def all(self) -> tuple[ModelEntry, ...]:
        return tuple(self._entries.values())
