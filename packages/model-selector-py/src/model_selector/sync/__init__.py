"""HuggingFace sync + derivation pipeline.

Per declared model:
``fetch_hf_metadata`` (I/O) -> ``map_hf_to_facts`` (pure) ->
``derive_attributes`` (pure) -> ``merge_attributes`` (pure, host overrides win).
"""

from __future__ import annotations

from typing import Callable, Mapping

from ..models import ModelEntry
from .derive import DEFAULT_PROFILE, DerivationProfile, derive_attributes
from .huggingface import fetch_hf_metadata, map_hf_to_facts
from .merge import merge_attributes

FetchFn = Callable[[str, "str | None"], Mapping[str, object]]

__all__ = [
    "DerivationProfile",
    "derive_attributes",
    "enrich_entry",
    "fetch_hf_metadata",
    "map_hf_to_facts",
    "merge_attributes",
    "sync_models",
]


def enrich_entry(
    entry: ModelEntry,
    *,
    profile: DerivationProfile | None = None,
    overwrite_factual: bool = False,
    hf_token: str | None = None,
    fetch: FetchFn = fetch_hf_metadata,
) -> ModelEntry:
    """Enrich a single entry from HF facts + derivation.

    Entries without ``hf_repo_id`` (e.g. proprietary Claude/GPT, which are not on
    the Hub) pass through unchanged. ``fetch`` is injectable for testing.
    """
    if not entry.hf_repo_id:
        return entry

    raw = fetch(entry.hf_repo_id, hf_token)
    facts = map_hf_to_facts(raw)
    # hf_repo_id helps the default profile detect instruction-tuned variants.
    facts_for_derive = {**facts, "hf_repo_id": entry.hf_repo_id}
    derived = derive_attributes(facts_for_derive, profile or DEFAULT_PROFILE)
    attributes, provenance = merge_attributes(
        entry, facts, derived, overwrite_factual=overwrite_factual
    )
    return entry.with_attributes(attributes, provenance)


def sync_models(
    entries: "list[ModelEntry | Mapping[str, object]]",
    *,
    store=None,
    overwrite_factual: bool = False,
    hf_token: str | None = None,
    profile: DerivationProfile | None = None,
    fetch: FetchFn = fetch_hf_metadata,
) -> list[ModelEntry]:
    """Enrich a list of models and return them (the return-to-caller path).

    If ``store`` is provided, each enriched entry is also upserted into it. The
    host persists the returned list however it likes (its own DB, etc.).
    """
    enriched: list[ModelEntry] = []
    for raw_entry in entries:
        entry = ModelEntry.coerce(raw_entry)
        result = enrich_entry(
            entry,
            profile=profile,
            overwrite_factual=overwrite_factual,
            hf_token=hf_token,
            fetch=fetch,
        )
        enriched.append(result)
        if store is not None:
            store.upsert(result)
    return enriched
