"""Query string parser. Ported 1:1 from the TS implementation.

Query syntax:
- Comma-separated conditions, AND logic: ``"fast, cheap, functions"``
- Boolean: ``local``, ``!local``, ``functions``
- Comparisons: ``cost <= 5``, ``speed >= 7``, ``context_window >= 32000``
- Equality: ``provider = openai``, ``provider != google``
- Custom weights: ``local:10, fast:5``

Aliases are expanded before tokenizing. Position-based weighting gives the first
condition the highest weight by default.
"""

from __future__ import annotations

import re
from typing import Mapping

from ..errors import QueryParseError
from ..models import AttributeValue
from .types import ParsedQuery, QueryCondition

# Mirrors the TS regexes exactly.
_WEIGHT_RE = re.compile(r"^(.+):(\d+)$")
_COMPARISON_RE = re.compile(
    r"^([a-z_][a-z0-9_]*)\s*(>=|<=|!=|>|<|=)\s*(.+)$", re.IGNORECASE
)
_BOOL_ATTR_RE = re.compile(r"^[a-z_][a-z0-9_]*$", re.IGNORECASE)


def _to_number(raw: str) -> AttributeValue | None:
    """Parse a numeric literal, preferring int for integral values.

    Returns ``None`` when the string is not numeric (mirrors JS ``isNaN``).
    """
    try:
        return int(raw)
    except ValueError:
        pass
    try:
        return float(raw)
    except ValueError:
        return None


def parse_value(raw_value: str) -> AttributeValue:
    """Parse a value string into the appropriate type."""
    if raw_value == "true":
        return True
    if raw_value == "false":
        return False

    num = _to_number(raw_value)
    if num is not None:
        return num

    if (raw_value.startswith('"') and raw_value.endswith('"')) or (
        raw_value.startswith("'") and raw_value.endswith("'")
    ):
        return raw_value[1:-1]

    return raw_value


def _parse_token(token: str, position: int, total_conditions: int) -> QueryCondition:
    trimmed = token.strip()

    # Custom weight suffix (e.g. "local:10").
    weight = total_conditions - position  # default: position-based weight
    condition_part = trimmed

    weight_match = _WEIGHT_RE.match(trimmed)
    if weight_match:
        condition_part = weight_match.group(1).strip()
        weight = int(weight_match.group(2))

    # Negation prefix.
    negated = False
    if condition_part.startswith("!"):
        negated = True
        condition_part = condition_part[1:].strip()

    # Comparison operators.
    comparison_match = _COMPARISON_RE.match(condition_part)
    if comparison_match:
        attribute = comparison_match.group(1)
        operator = comparison_match.group(2)
        raw_value = comparison_match.group(3).strip()
        return QueryCondition(
            attribute=attribute,
            operator=operator,
            value=parse_value(raw_value),
            negated=negated,
            weight=weight,
        )

    # Simple boolean attribute (e.g. "local" or "!local").
    if _BOOL_ATTR_RE.match(condition_part):
        return QueryCondition(
            attribute=condition_part,
            operator="=",
            value=True,
            negated=negated,
            weight=weight,
        )

    raise QueryParseError(f'Invalid query condition: "{trimmed}"')


def expand_aliases(query: str, aliases: Mapping[str, str]) -> str:
    """Expand aliases in a query string before tokenizing."""
    tokens = [t.strip() for t in query.split(",")]
    expanded_tokens: list[str] = []

    for token in tokens:
        weight_match = _WEIGHT_RE.match(token)
        base_token = weight_match.group(1).strip() if weight_match else token
        weight_suffix = f":{weight_match.group(2)}" if weight_match else ""

        negated = base_token.startswith("!")
        lookup_token = base_token[1:] if negated else base_token

        alias_value = aliases.get(lookup_token)
        if alias_value:
            if negated:
                # For simple boolean aliases, negate; for comparison aliases this
                # may not be meaningful, but we still wrap so it parses.
                alias_value = f"!({alias_value})"
            expanded_tokens.append(alias_value + weight_suffix)
        else:
            expanded_tokens.append(token)

    return ", ".join(expanded_tokens)


def parse_query(query: str, aliases: Mapping[str, str] | None = None) -> ParsedQuery:
    """Parse a query string into a structured :class:`ParsedQuery`."""
    expanded_query = expand_aliases(query, aliases or {})

    tokens = [t.strip() for t in expanded_query.split(",")]
    tokens = [t for t in tokens if t]

    if not tokens:
        raise QueryParseError("Empty query")

    conditions = tuple(
        _parse_token(token, index, len(tokens)) for index, token in enumerate(tokens)
    )
    return ParsedQuery(conditions=conditions)
