from model_selector import derive_attributes
from model_selector.sync.derive import DEFAULT_PROFILE, DerivationProfile, default_speed

DENSE_8B = {"params_total": 8_000_000_000, "params_active": 8_000_000_000}
DENSE_70B = {"params_total": 70_000_000_000, "params_active": 70_000_000_000}
# Mixtral-style: 8 experts, 2 active -> active params far below total.
MOE = {"params_total": 46_700_000_000, "params_active": 12_900_000_000}


def test_derives_quality_speed_cost():
    d = derive_attributes(DENSE_8B)
    assert set(d) == {"quality", "speed", "cost"}
    assert all(1 <= v <= 10 for v in d.values())


def test_bigger_model_higher_quality_lower_speed():
    small = derive_attributes(DENSE_8B)
    big = derive_attributes(DENSE_70B)
    assert big["quality"] > small["quality"]
    assert big["speed"] < small["speed"]
    assert big["cost"] > small["cost"]


def test_moe_scores_fast_on_active_params():
    # A 47B MoE with 13B active should be faster than a dense 70B.
    moe_speed = derive_attributes(MOE)["speed"]
    dense_speed = derive_attributes(DENSE_70B)["speed"]
    assert moe_speed > dense_speed


def test_no_params_yields_nothing():
    # Proprietary models (no HF facts) get no derived attrs.
    assert derive_attributes({"local": True}) == {}


def test_instruct_bonus_raises_quality():
    base = derive_attributes(DENSE_8B)
    tuned = derive_attributes({**DENSE_8B, "hf_repo_id": "meta-llama/Llama-3.1-8B-Instruct"})
    assert tuned["quality"] >= base["quality"]


def test_custom_profile_overrides():
    profile = DerivationProfile(speed=lambda facts: 1.0)
    d = derive_attributes(DENSE_8B, profile)
    assert d["speed"] == 1.0
    # other heuristics still default
    assert d["quality"] == derive_attributes(DENSE_8B)["quality"]


def test_default_speed_is_clamped():
    assert default_speed({"params_active": 1}) <= 10
    assert default_speed({"params_active": 10**15}) >= 1
