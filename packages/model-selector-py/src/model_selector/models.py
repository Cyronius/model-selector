"""Core data model: model entries, the registry, and provenance.

All types are stdlib frozen dataclasses so the core stays zero-dependency and
embeddable. They are JSON-serializable via :func:`dataclasses.asdict`, and a
Pydantic host can wrap them trivially.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from typing import Mapping, Union

# A single attribute value. Mirrors the TS ``AttributeValue`` union.
AttributeValue = Union[bool, int, float, str]

# Where an attribute value came from. Used to drive merge precedence and to keep
# host-authored values, raw HF facts, and crude derived heuristics distinguishable.
USER = "user"
HUGGINGFACE = "huggingface"
DERIVED = "derived"
Provenance = str


@dataclass(frozen=True, slots=True)
class ModelEntry:
    """A single model the host has access to.

    ``id`` is the host's own identifier — it is exactly what selection hands back.
    ``attributes`` is the matchable bag (``cost``, ``speed``, ``context_window``,
    ``functions``, ...). ``provenance`` maps each attribute name to ``user`` |
    ``huggingface`` | ``derived``. ``hf_repo_id`` points at the Hub repo used to
    enrich this entry (e.g. ``"meta-llama/Llama-3.1-8B-Instruct"``).
    """

    id: str
    provider: str | None = None
    attributes: Mapping[str, AttributeValue] = field(default_factory=dict)
    provenance: Mapping[str, Provenance] = field(default_factory=dict)
    hf_repo_id: str | None = None

    @classmethod
    def coerce(cls, value: "ModelEntry | Mapping[str, object]") -> "ModelEntry":
        """Coerce a plain dict (the stateless per-request path) into a ModelEntry.

        Already-constructed entries pass through unchanged. Unknown keys are
        ignored so hosts can hand us their richer rows verbatim.
        """
        if isinstance(value, ModelEntry):
            return value
        if not isinstance(value, Mapping):
            raise TypeError(f"Cannot coerce {type(value).__name__} to ModelEntry")
        data = dict(value)
        if "id" not in data:
            raise ValueError("ModelEntry dict requires an 'id' key")
        return cls(
            id=str(data["id"]),
            provider=data.get("provider"),
            attributes=dict(data.get("attributes") or {}),
            provenance=dict(data.get("provenance") or {}),
            hf_repo_id=data.get("hf_repo_id"),
        )

    def with_attributes(
        self,
        attributes: Mapping[str, AttributeValue],
        provenance: Mapping[str, Provenance],
    ) -> "ModelEntry":
        """Return a copy with replaced attribute + provenance maps."""
        return replace(self, attributes=dict(attributes), provenance=dict(provenance))

    def to_dict(self) -> dict[str, object]:
        from dataclasses import asdict

        return asdict(self)


@dataclass(frozen=True, slots=True)
class ModelRegistry:
    """A set of model entries plus alias definitions for the query DSL."""

    entries: tuple[ModelEntry, ...] = ()
    aliases: Mapping[str, str] = field(default_factory=dict)

    @classmethod
    def from_models(
        cls,
        models: "list[ModelEntry | Mapping[str, object]]",
        aliases: Mapping[str, str] | None = None,
    ) -> "ModelRegistry":
        return cls(
            entries=tuple(ModelEntry.coerce(m) for m in models),
            aliases=dict(aliases or {}),
        )

    def get(self, model_id: str) -> ModelEntry | None:
        for entry in self.entries:
            if entry.id == model_id:
                return entry
        return None
