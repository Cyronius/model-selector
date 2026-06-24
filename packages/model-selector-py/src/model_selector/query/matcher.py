"""Model attribute matcher. Ported 1:1 from the TS implementation.

Scoring: ``score`` is the sum of matched condition weights, ``max_score`` the sum
of all weights, ``normalized_score = score / max_score``, and ``exact_match`` is
``score == max_score``. A missing attribute fails normally but passes when negated.
Numeric comparisons apply only when both sides are numeric — and ``bool`` is
explicitly excluded from "numeric" to match TS ``typeof === 'number'`` intent.
"""

from __future__ import annotations

from typing import Mapping

from ..models import AttributeValue
from .types import MatchResult, ParsedQuery, QueryCondition

ModelAttributes = Mapping[str, AttributeValue]

_MISSING = object()


def _is_number(value: object) -> bool:
    """True for int/float but not bool — mirrors JS ``typeof x === 'number'``."""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _strict_eq(a: object, b: object) -> bool:
    """JS ``===`` for our value types (bool / number / str).

    Different "types" are never equal; bool is its own type (so ``0 === false`` is
    false), while int and float are both JS ``number``.
    """
    a_bool, b_bool = isinstance(a, bool), isinstance(b, bool)
    if a_bool or b_bool:
        return a_bool and b_bool and a == b
    a_num, b_num = _is_number(a), _is_number(b)
    if a_num or b_num:
        return a_num and b_num and a == b
    return type(a) is type(b) and a == b


def evaluate_condition(condition: QueryCondition, attributes: ModelAttributes) -> bool:
    """Check whether a single condition matches against model attributes."""
    attr_value = attributes.get(condition.attribute, _MISSING)

    # Missing attribute fails normally, passes when negated.
    if attr_value is _MISSING:
        return condition.negated

    op = condition.operator
    if op == "=":
        result = _strict_eq(attr_value, condition.value)
    elif op == "!=":
        result = not _strict_eq(attr_value, condition.value)
    elif op in (">", ">=", "<", "<="):
        if _is_number(attr_value) and _is_number(condition.value):
            if op == ">":
                result = attr_value > condition.value
            elif op == ">=":
                result = attr_value >= condition.value
            elif op == "<":
                result = attr_value < condition.value
            else:
                result = attr_value <= condition.value
        else:
            result = False
    else:
        result = False

    return (not result) if condition.negated else result


def match_model(
    model_id: str,
    attributes: ModelAttributes,
    query: ParsedQuery,
) -> MatchResult:
    """Match a model's attributes against a parsed query."""
    matched: list[str] = []
    missing: list[str] = []
    score = 0
    max_score = 0

    for condition in query.conditions:
        max_score += condition.weight
        if evaluate_condition(condition, attributes):
            score += condition.weight
            matched.append(condition.attribute)
        else:
            missing.append(condition.attribute)

    normalized = score / max_score if max_score != 0 else 0.0

    return MatchResult(
        model_id=model_id,
        matches=score > 0,
        score=score,
        max_score=max_score,
        normalized_score=normalized,
        exact_match=score == max_score,
        matched_attributes=tuple(matched),
        missing_attributes=tuple(missing),
    )


def normalize_score(result: MatchResult) -> float:
    """Normalized score (0-1) from a match result."""
    if result.max_score == 0:
        return 0.0
    return result.score / result.max_score
