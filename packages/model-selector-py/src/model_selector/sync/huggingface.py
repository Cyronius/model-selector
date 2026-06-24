"""HuggingFace metadata: fetch (I/O) and map-to-facts (pure).

``fetch_hf_metadata`` does the network call and returns a normalized raw dict.
``map_hf_to_facts`` is pure and turns that raw dict into our factual attributes,
so it is fully unit-testable on captured fixtures.
"""

from __future__ import annotations

from typing import Any, Mapping

from ..errors import SyncError
from ..models import AttributeValue

# Keys HF reliably exposes for open-weight models.
FACTUAL_FIELDS = (
    "params_total",
    "params_active",
    "architecture",
    "context_window",
    "license",
    "gated",
    "pipeline_tag",
    "tags",
    "downloads",
    "likes",
    "created_at",
    "local",
)


def fetch_hf_metadata(repo_id: str, token: str | None = None) -> dict[str, Any]:
    """Fetch and normalize raw metadata for a Hub repo (network I/O).

    Returns a plain dict shaped for :func:`map_hf_to_facts`. Requires the optional
    ``huggingface`` extra.
    """
    try:
        from huggingface_hub import HfApi, hf_hub_download
    except ImportError as exc:
        raise SyncError(
            "HuggingFace sync requires the 'huggingface' extra: "
            "pip install model-selector[huggingface]"
        ) from exc

    api = HfApi(token=token)
    try:
        info = api.model_info(repo_id, securityStatus=False)
    except Exception as exc:  # noqa: BLE001 - surface any Hub error uniformly
        raise SyncError(f"Failed to fetch HF metadata for {repo_id!r}: {exc}") from exc

    config = dict(getattr(info, "config", None) or {})
    # The summarized model_info config often omits context window; pull config.json.
    if "max_position_embeddings" not in config:
        try:
            import json

            path = hf_hub_download(repo_id, "config.json", token=token)
            with open(path, encoding="utf-8") as fh:
                config = {**json.load(fh), **config}
        except Exception:  # noqa: BLE001 - config.json is best-effort
            pass

    safetensors = getattr(info, "safetensors", None)
    safetensors_dict: dict[str, Any] = {}
    if safetensors is not None:
        safetensors_dict = {
            "total": getattr(safetensors, "total", None)
            if not isinstance(safetensors, dict)
            else safetensors.get("total"),
        }

    created_at = getattr(info, "created_at", None)

    return {
        "id": repo_id,
        "downloads": getattr(info, "downloads", None),
        "likes": getattr(info, "likes", None),
        "created_at": created_at.isoformat() if hasattr(created_at, "isoformat") else created_at,
        "gated": getattr(info, "gated", None),
        "tags": list(getattr(info, "tags", None) or []),
        "pipeline_tag": getattr(info, "pipeline_tag", None),
        "card_data": dict(getattr(info, "card_data", None) or {}),
        "config": config,
        "safetensors": safetensors_dict,
    }


def _safetensors_total(raw: Mapping[str, Any]) -> int | None:
    st = raw.get("safetensors") or {}
    total = st.get("total") if isinstance(st, Mapping) else None
    return int(total) if isinstance(total, (int, float)) else None


def _approx_active_params(total: int, config: Mapping[str, Any]) -> int:
    """Approximate active params for MoE models; equal to total for dense models."""
    num_experts = config.get("num_local_experts")
    experts_per_tok = config.get("num_experts_per_tok")
    if (
        isinstance(num_experts, (int, float))
        and num_experts
        and isinstance(experts_per_tok, (int, float))
    ):
        return int(total * (experts_per_tok / num_experts))
    return total


def map_hf_to_facts(raw: Mapping[str, Any]) -> dict[str, AttributeValue]:
    """Map a raw HF metadata dict to our factual attributes (pure)."""
    facts: dict[str, AttributeValue] = {"local": True}
    config = raw.get("config") or {}

    total = _safetensors_total(raw)
    if total is not None:
        facts["params_total"] = total
        facts["params_active"] = _approx_active_params(total, config)

    model_type = config.get("model_type")
    if model_type:
        facts["architecture"] = str(model_type)

    ctx = config.get("max_position_embeddings")
    if isinstance(ctx, (int, float)):
        facts["context_window"] = int(ctx)

    card_data = raw.get("card_data") or {}
    license_ = card_data.get("license") if isinstance(card_data, Mapping) else None
    if license_:
        facts["license"] = str(license_)

    gated = raw.get("gated")
    facts["gated"] = bool(gated) and gated not in (False, "False", "false")

    pipeline_tag = raw.get("pipeline_tag")
    if pipeline_tag:
        facts["pipeline_tag"] = str(pipeline_tag)

    tags = raw.get("tags")
    if tags:
        facts["tags"] = ",".join(str(t) for t in tags)

    for key in ("downloads", "likes"):
        value = raw.get(key)
        if isinstance(value, (int, float)):
            facts[key] = int(value)

    created_at = raw.get("created_at")
    if created_at:
        facts["created_at"] = str(created_at)

    return facts
