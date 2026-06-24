"""Metadata stores: persist enriched model registries.

The default selection path is stateless (return-to-caller); these stores are for
hosts that want model-selector to own a file. All implement the
:class:`MetadataStore` protocol.
"""

from .base import MetadataStore
from .json_store import JSONMetadataStore
from .memory import InMemoryStore
from .toml_store import TomlMetadataStore

__all__ = [
    "MetadataStore",
    "InMemoryStore",
    "JSONMetadataStore",
    "TomlMetadataStore",
]
