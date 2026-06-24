"""Query DSL value types: conditions, parsed queries, match results."""

from __future__ import annotations

from dataclasses import dataclass, field

from ..models import AttributeValue

ComparisonOperator = str
COMPARISON_OPERATORS: tuple[str, ...] = (">=", "<=", "!=", ">", "<", "=")


@dataclass(frozen=True, slots=True)
class QueryCondition:
    """A single parsed condition, e.g. ``cost <= 5`` or ``!local``.

    ``weight`` is the position-based importance (higher = more important) unless
    overridden by a ``:N`` suffix in the query.
    """

    attribute: str
    operator: ComparisonOperator
    value: AttributeValue
    negated: bool
    weight: int


@dataclass(frozen=True, slots=True)
class ParsedQuery:
    conditions: tuple[QueryCondition, ...]


@dataclass(frozen=True, slots=True)
class MatchResult:
    """Outcome of matching one model against a parsed query."""

    model_id: str
    matches: bool  # at least one condition matched (score > 0)
    score: float
    max_score: float
    normalized_score: float  # score / max_score (0 if max_score == 0)
    exact_match: bool  # score == max_score
    matched_attributes: tuple[str, ...] = field(default_factory=tuple)
    missing_attributes: tuple[str, ...] = field(default_factory=tuple)
