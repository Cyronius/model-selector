"""model-selector — query-based runtime LLM model selection.

The host owns its models and its LLM clients. It supplies the list of models it
has access to plus a query string; model-selector *only does the match* and hands
back the selected model id(s) + match metadata. It never instantiates a client.

    from model_selector import select_model, ModelRegistry

    registry = ModelRegistry.from_models(
        [
            {"id": "gpt5", "attributes": {"cost": 8, "speed": 6, "functions": True}},
            {"id": "haiku", "attributes": {"cost": 2, "speed": 9, "functions": True}},
        ],
        aliases={"cheap": "cost <= 3", "fast": "speed >= 7"},
    )
    res = select_model("cheap, fast, functions", registry)
    client = host_make_client(res.model_id)  # client creation stays the host's job
"""

from __future__ import annotations

from .errors import ModelSelectorError, QueryParseError, StoreError, SyncError
from .models import (
    DERIVED,
    HUGGINGFACE,
    USER,
    AttributeValue,
    ModelEntry,
    ModelRegistry,
)
from .query import (
    MatchResult,
    ParsedQuery,
    QueryCondition,
    expand_aliases,
    match_model,
    normalize_score,
    parse_query,
)
from .select import rank_models, select_model, select_model_from, select_models
from .store import (
    InMemoryStore,
    JSONMetadataStore,
    MetadataStore,
    TomlMetadataStore,
)
from .sync import (
    DerivationProfile,
    derive_attributes,
    enrich_entry,
    fetch_hf_metadata,
    map_hf_to_facts,
    merge_attributes,
    sync_models,
)

__version__ = "0.2.0"

__all__ = [
    "__version__",
    # data model
    "AttributeValue",
    "ModelEntry",
    "ModelRegistry",
    "USER",
    "HUGGINGFACE",
    "DERIVED",
    # query DSL
    "ParsedQuery",
    "QueryCondition",
    "MatchResult",
    "parse_query",
    "expand_aliases",
    "match_model",
    "normalize_score",
    # selection
    "rank_models",
    "select_model",
    "select_models",
    "select_model_from",
    # stores
    "MetadataStore",
    "InMemoryStore",
    "JSONMetadataStore",
    "TomlMetadataStore",
    # sync + derivation
    "sync_models",
    "enrich_entry",
    "fetch_hf_metadata",
    "map_hf_to_facts",
    "derive_attributes",
    "merge_attributes",
    "DerivationProfile",
    # errors
    "ModelSelectorError",
    "QueryParseError",
    "StoreError",
    "SyncError",
]
