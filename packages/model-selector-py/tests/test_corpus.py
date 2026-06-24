"""Run the shared golden corpus through the Python implementation.

The same JSON is asserted by the TS suite, keeping the two matchers in lockstep.
"""

import json

import pytest

from conftest import CORPUS_DIR
from model_selector import match_model, parse_query
from model_selector.errors import QueryParseError

PARSE = json.loads((CORPUS_DIR / "parse.json").read_text(encoding="utf-8"))
MATCH = json.loads((CORPUS_DIR / "match.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", PARSE["cases"], ids=lambda c: c["query"] or "<empty>")
def test_parse_corpus(case):
    if case.get("error"):
        with pytest.raises(QueryParseError):
            parse_query(case["query"], case.get("aliases") or {})
        return
    parsed = parse_query(case["query"], case.get("aliases") or {})
    actual = [
        {
            "attribute": c.attribute,
            "operator": c.operator,
            "value": c.value,
            "negated": c.negated,
            "weight": c.weight,
        }
        for c in parsed.conditions
    ]
    assert actual == case["conditions"]


@pytest.mark.parametrize(
    "case",
    MATCH["cases"],
    ids=lambda c: f"{c['model']}::{c['query']}",
)
def test_match_corpus(case):
    attrs = MATCH["models"][case["model"]]
    parsed = parse_query(case["query"], case.get("aliases") or {})
    result = match_model(case["model"], attrs, parsed)
    exp = case["expected"]
    assert result.matches == exp["matches"]
    assert result.score == exp["score"]
    assert result.max_score == exp["max_score"]
    assert result.normalized_score == pytest.approx(exp["normalized_score"])
    assert result.exact_match == exp["exact_match"]
    assert list(result.matched_attributes) == exp["matched_attributes"]
    assert list(result.missing_attributes) == exp["missing_attributes"]
