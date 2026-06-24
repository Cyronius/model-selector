from model_selector import ModelEntry, merge_attributes
from model_selector.sync.merge import SUBJECTIVE_FIELDS


def test_precedence_user_over_factual_over_derived():
    entry = ModelEntry(
        id="m",
        attributes={"cost": 5, "speed": 3},
        provenance={"cost": "user", "speed": "user"},
    )
    facts = {"context_window": 8192, "params_total": 8_000_000_000}
    derived = {"speed": 6.7, "quality": 4.5, "cost": 3.1}

    attrs, prov = merge_attributes(entry, facts, derived)

    assert attrs["cost"] == 5 and prov["cost"] == "user"
    assert attrs["speed"] == 3 and prov["speed"] == "user"  # user beats derived
    assert attrs["context_window"] == 8192 and prov["context_window"] == "huggingface"
    assert attrs["quality"] == 4.5 and prov["quality"] == "derived"
    assert attrs["params_total"] == 8_000_000_000 and prov["params_total"] == "huggingface"


def test_factual_preserved_on_resync_by_default():
    entry = ModelEntry(
        id="m",
        attributes={"context_window": 9999},
        provenance={"context_window": "huggingface"},
    )
    facts = {"context_window": 8192}

    attrs, _ = merge_attributes(entry, facts, {})
    assert attrs["context_window"] == 9999  # kept


def test_overwrite_factual_refreshes():
    entry = ModelEntry(
        id="m",
        attributes={"context_window": 9999},
        provenance={"context_window": "huggingface"},
    )
    facts = {"context_window": 8192}

    attrs, _ = merge_attributes(entry, facts, {}, overwrite_factual=True)
    assert attrs["context_window"] == 8192


def test_subjective_fields_constant():
    assert SUBJECTIVE_FIELDS == {"cost", "speed", "quality", "instruction_following", "reasoning"}


def test_unknown_provenance_treated_as_user():
    entry = ModelEntry(id="m", attributes={"foo": 1})  # no provenance recorded
    attrs, prov = merge_attributes(entry, {}, {})
    assert attrs["foo"] == 1 and prov["foo"] == "user"
