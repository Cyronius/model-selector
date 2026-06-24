# Ported 1:1 from packages/model-selector-ts/src/query/parser.test.ts
import pytest

from model_selector import parse_query
from model_selector.errors import QueryParseError


class TestBooleanAttributes:
    def test_simple_boolean_as_true(self):
        result = parse_query("local")
        assert len(result.conditions) == 1
        c = result.conditions[0]
        assert (c.attribute, c.operator, c.value, c.negated) == ("local", "=", True, False)

    def test_negated_boolean(self):
        c = parse_query("!local").conditions[0]
        assert (c.attribute, c.operator, c.value, c.negated) == ("local", "=", True, True)

    def test_multiple_booleans(self):
        result = parse_query("local, functions, reasoning")
        assert [c.attribute for c in result.conditions] == ["local", "functions", "reasoning"]


class TestNumericComparisons:
    def test_gte(self):
        c = parse_query("context_window >= 32000").conditions[0]
        assert (c.attribute, c.operator, c.value) == ("context_window", ">=", 32000)

    def test_lte(self):
        c = parse_query("cost <= 5").conditions[0]
        assert (c.attribute, c.operator, c.value) == ("cost", "<=", 5)

    def test_gt(self):
        c = parse_query("speed > 7").conditions[0]
        assert (c.attribute, c.operator, c.value) == ("speed", ">", 7)

    def test_lt(self):
        c = parse_query("cost < 3").conditions[0]
        assert (c.attribute, c.operator, c.value) == ("cost", "<", 3)

    def test_large_value(self):
        c = parse_query("context_window >= 100000").conditions[0]
        assert (c.attribute, c.operator, c.value) == ("context_window", ">=", 100000)


class TestEquality:
    def test_string_equality(self):
        c = parse_query("provider = openai").conditions[0]
        assert (c.attribute, c.operator, c.value) == ("provider", "=", "openai")

    def test_inequality(self):
        c = parse_query("provider != google").conditions[0]
        assert (c.attribute, c.operator, c.value) == ("provider", "!=", "google")

    def test_quoted_value(self):
        c = parse_query('provider = "openai"').conditions[0]
        assert c.attribute == "provider" and c.value == "openai"


class TestCombined:
    def test_mixed(self):
        conds = parse_query("local, context_window >= 32000, functions").conditions
        assert len(conds) == 3
        assert conds[0].attribute == "local"
        assert (conds[1].attribute, conds[1].operator, conds[1].value) == (
            "context_window",
            ">=",
            32000,
        )
        assert conds[2].attribute == "functions"

    def test_complex(self):
        conds = parse_query("cost <= 5, speed >= 7, functions, !local").conditions
        assert len(conds) == 4
        assert (conds[0].attribute, conds[0].operator, conds[0].value) == ("cost", "<=", 5)
        assert (conds[1].attribute, conds[1].operator, conds[1].value) == ("speed", ">=", 7)
        assert conds[2].attribute == "functions" and conds[2].value is True
        assert conds[3].attribute == "local" and conds[3].negated is True


class TestPositionWeights:
    def test_position_based(self):
        conds = parse_query("first, second, third").conditions
        assert [c.weight for c in conds] == [3, 2, 1]

    def test_custom_weights(self):
        conds = parse_query("cheap:10, fast:5, local:3").conditions
        assert [c.weight for c in conds] == [10, 5, 3]


class TestAliases:
    def test_simple_alias(self):
        c = parse_query("fast", {"fast": "speed >= 7"}).conditions[0]
        assert (c.attribute, c.operator, c.value) == ("speed", ">=", 7)

    def test_multiple_aliases(self):
        conds = parse_query("fast, cheap", {"fast": "speed >= 7", "cheap": "cost <= 3"}).conditions
        assert len(conds) == 2
        assert conds[0].attribute == "speed"
        assert conds[1].attribute == "cost"


class TestErrors:
    def test_empty_query(self):
        with pytest.raises(QueryParseError, match="Empty query"):
            parse_query("")

    def test_invalid_syntax(self):
        with pytest.raises(QueryParseError, match="Invalid query condition"):
            parse_query("123invalid")
