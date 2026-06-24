# Ported 1:1 from packages/model-selector-ts/src/query/matcher.test.ts
from model_selector import match_model, normalize_score, parse_query

gpt4 = {
    "context_window": 128000,
    "cost": 8,
    "speed": 6,
    "functions": True,
    "local": False,
    "provider": "openai",
}
gpt4mini = {
    "context_window": 128000,
    "cost": 2,
    "speed": 9,
    "functions": True,
    "local": False,
    "provider": "openai",
}
llama3 = {
    "context_window": 8192,
    "cost": 0,
    "speed": 7,
    "functions": False,
    "local": True,
    "provider": "ollama",
}


def m(attrs, query):
    return match_model("x", attrs, parse_query(query))


class TestBooleanAttributes:
    def test_local_true(self):
        assert m(llama3, "local").exact_match is True
        assert m(gpt4, "local").exact_match is False

    def test_negated_local(self):
        assert m(gpt4, "!local").exact_match is True
        assert m(gpt4mini, "!local").exact_match is True
        assert m(llama3, "!local").exact_match is False

    def test_functions(self):
        assert m(gpt4, "functions").exact_match is True
        assert m(gpt4mini, "functions").exact_match is True
        assert m(llama3, "functions").exact_match is False

    def test_negated_local_and_functions(self):
        q = "!local, functions"
        assert m(gpt4, q).exact_match is True
        assert m(gpt4mini, q).exact_match is True
        assert m(llama3, q).exact_match is False


class TestNumericComparisons:
    def test_ctx_32k(self):
        q = "context_window >= 32000"
        assert m(gpt4, q).exact_match is True
        assert m(gpt4mini, q).exact_match is True
        assert m(llama3, q).exact_match is False

    def test_ctx_100k(self):
        q = "context_window >= 100000"
        assert m(gpt4, q).exact_match is True
        assert m(gpt4mini, q).exact_match is True
        assert m(llama3, q).exact_match is False

    def test_cost_lte_3(self):
        q = "cost <= 3"
        assert m(gpt4, q).exact_match is False
        assert m(gpt4mini, q).exact_match is True
        assert m(llama3, q).exact_match is True

    def test_speed_gte_8(self):
        q = "speed >= 8"
        assert m(gpt4, q).exact_match is False
        assert m(gpt4mini, q).exact_match is True
        assert m(llama3, q).exact_match is False

    def test_cost_eq_0(self):
        q = "cost = 0"
        assert m(gpt4, q).exact_match is False
        assert m(llama3, q).exact_match is True


class TestCombined:
    def test_cost_speed_functions(self):
        q = "cost <= 5, speed >= 7, functions"
        assert m(gpt4mini, q).exact_match is True
        assert m(gpt4, q).exact_match is False
        assert m(llama3, q).exact_match is False

    def test_local_cost(self):
        q = "local, cost <= 1"
        assert m(llama3, q).exact_match is True
        assert m(gpt4, q).exact_match is False

    def test_cost_ctx(self):
        q = "cost <= 3, context_window >= 100000"
        assert m(gpt4mini, q).exact_match is True
        assert m(llama3, q).exact_match is False


class TestPartialMatches:
    def test_partial(self):
        q = "local, context_window >= 100000"
        r1 = m(llama3, q)
        assert r1.exact_match is False
        assert "local" in r1.matched_attributes
        assert "context_window" in r1.missing_attributes
        r2 = m(gpt4, q)
        assert r2.exact_match is False
        assert "context_window" in r2.matched_attributes
        assert "local" in r2.missing_attributes

    def test_partial_counts(self):
        q = "local, functions, speed >= 7"
        r1 = m(llama3, q)
        assert len(r1.matched_attributes) == 2
        assert len(r1.missing_attributes) == 1
        r2 = m(gpt4mini, q)
        assert len(r2.matched_attributes) == 2
        assert len(r2.missing_attributes) == 1


class TestScoringWithWeights:
    def test_position_weights(self):
        q = "local, functions, speed >= 7"
        assert normalize_score(m(llama3, q)) > normalize_score(m(gpt4mini, q))

    def test_custom_weights(self):
        q = "functions:10, local:1"
        llama = normalize_score(m(llama3, q))
        gpt = normalize_score(m(gpt4, q))
        assert gpt > llama
        assert abs(gpt - 10 / 11) < 0.01
        assert abs(llama - 1 / 11) < 0.01


class TestStringEquality:
    def test_provider_eq(self):
        q = "provider = openai"
        assert m(gpt4, q).exact_match is True
        assert m(llama3, q).exact_match is False

    def test_provider_neq(self):
        q = "provider != google"
        assert m(gpt4, q).exact_match is True
        assert m(llama3, q).exact_match is True


class TestMissingAttributes:
    def test_missing_fails(self):
        q = "reasoning"
        assert m(gpt4, q).exact_match is False
        assert m(llama3, q).exact_match is False

    def test_negated_missing_passes(self):
        assert m(gpt4, "!reasoning").exact_match is True
