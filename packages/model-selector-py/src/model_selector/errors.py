"""Exception types for model-selector."""

from __future__ import annotations


class ModelSelectorError(Exception):
    """Base class for all model-selector errors."""


class QueryParseError(ModelSelectorError, ValueError):
    """Raised when a query string cannot be parsed."""


class StoreError(ModelSelectorError):
    """Raised when a metadata store operation fails."""


class SyncError(ModelSelectorError):
    """Raised when HuggingFace metadata sync fails.

    The most common cause is that the optional ``huggingface`` extra is not
    installed; the message says so.
    """
