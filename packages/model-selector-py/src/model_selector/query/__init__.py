"""Query DSL: parsing and matching."""

from .matcher import evaluate_condition, match_model, normalize_score
from .parser import expand_aliases, parse_query
from .types import (
    COMPARISON_OPERATORS,
    ComparisonOperator,
    MatchResult,
    ParsedQuery,
    QueryCondition,
)

__all__ = [
    "COMPARISON_OPERATORS",
    "ComparisonOperator",
    "MatchResult",
    "ParsedQuery",
    "QueryCondition",
    "evaluate_condition",
    "expand_aliases",
    "match_model",
    "normalize_score",
    "parse_query",
]
