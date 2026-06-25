"""Ingest popular-model metadata from HuggingFace into the shared corpus.

Two modes, with network strictly isolated behind ``--fetch``:

  python shared/corpus/ingest_hf.py --fetch   # network: refresh hf_raw/ snapshots
  python shared/corpus/ingest_hf.py           # offline: derive models.json from snapshots

``--fetch`` calls the real ``fetch_hf_metadata`` once per repo and freezes the raw
response under ``hf_raw/<slug>.json`` (plus an ``hf_manifest.json`` audit). The
default (offline) mode replays those frozen snapshots through the real enrichment
pipeline (``enrich_entry`` with an injected fetch) to produce the deterministic
``models.json`` registry that both test suites consume. Re-running the offline mode
must be reproducible: same snapshots in -> identical models.json out.

Requesting ``--fetch`` needs the optional extra:  pip install -e .[huggingface]
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "packages" / "model-selector-py" / "src"))

from model_selector import ModelEntry, enrich_entry  # noqa: E402
from model_selector.errors import SyncError  # noqa: E402

HERE = Path(__file__).resolve().parent
RAW_DIR = HERE / "hf_raw"
MANIFEST_PATH = HERE / "hf_manifest.json"
MODELS_PATH = HERE / "models.json"

# Popular models to ingest. ``id`` is the host-facing identifier we hand back from
# selection; ``repo`` is the HF repo to enrich from. The mix exercises dense vs MoE
# active-param logic, a wide param/context spread, and varied licenses.
MODELS = [
    {"id": "llama-3.1-8b", "repo": "meta-llama/Llama-3.1-8B-Instruct", "provider": "meta"},
    {"id": "llama-3.1-70b", "repo": "meta-llama/Llama-3.1-70B-Instruct", "provider": "meta"},
    {"id": "mistral-7b", "repo": "mistralai/Mistral-7B-Instruct-v0.3", "provider": "mistral"},
    {"id": "qwen2.5-7b", "repo": "Qwen/Qwen2.5-7B-Instruct", "provider": "qwen"},
    {"id": "qwen2.5-72b", "repo": "Qwen/Qwen2.5-72B-Instruct", "provider": "qwen"},
    {"id": "gemma-2-9b", "repo": "google/gemma-2-9b-it", "provider": "google"},
    {"id": "gemma-3-27b", "repo": "google/gemma-3-27b-it", "provider": "google"},
    {"id": "phi-3.5-mini", "repo": "microsoft/Phi-3.5-mini-instruct", "provider": "microsoft"},
    {"id": "mixtral-8x7b", "repo": "mistralai/Mixtral-8x7B-Instruct-v0.1", "provider": "mistral"},
    {"id": "deepseek-v3", "repo": "deepseek-ai/DeepSeek-V3", "provider": "deepseek"},
    {"id": "kimi-k2", "repo": "moonshotai/Kimi-K2-Instruct", "provider": "moonshot"},
]

# Attributes echoed per model after deriving, as a quick eyeball of the registry.
_AUDIT_FACTS = ("quality", "speed", "cost", "context_window", "params_total", "params_active")


def _slug(model: dict) -> str:
    return model["id"]


def fetch_all() -> None:
    """Network mode: freeze a raw snapshot per repo and write the audit manifest."""
    from model_selector import fetch_hf_metadata

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    manifest = []
    for model in MODELS:
        repo = model["repo"]
        record = {"id": model["id"], "repo": repo, "ok": False}
        try:
            raw = fetch_hf_metadata(repo)
        except SyncError as exc:
            record["error"] = str(exc)
            print(f"FAIL {repo}: {exc}")
        else:
            (RAW_DIR / f"{_slug(model)}.json").write_text(
                json.dumps(raw, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )
            cfg = raw.get("config") or {}
            record["ok"] = True
            record["gated"] = raw.get("gated")
            record["config_json_available"] = "max_position_embeddings" in cfg
            print(f"OK   {repo}  gated={raw.get('gated')}  cfg={record['config_json_available']}")
        manifest.append(record)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"\nwrote {sum(m['ok'] for m in manifest)}/{len(MODELS)} snapshots to {RAW_DIR}")


def _load_snapshot(slug: str) -> dict:
    return json.loads((RAW_DIR / f"{slug}.json").read_text(encoding="utf-8"))


def derive_models() -> None:
    """Offline mode: replay frozen snapshots through enrich_entry -> models.json."""
    if not RAW_DIR.exists():
        raise SystemExit(f"no snapshots at {RAW_DIR}; run with --fetch first")

    registry: dict[str, dict] = {}
    audit = []
    for model in MODELS:
        slug = _slug(model)
        snapshot_path = RAW_DIR / f"{slug}.json"
        if not snapshot_path.exists():
            print(f"skip {slug}: no snapshot")
            continue
        snapshot = _load_snapshot(slug)
        entry = ModelEntry(id=slug, provider=model["provider"], hf_repo_id=model["repo"])
        # Inject the frozen snapshot so derivation is fully offline + deterministic.
        enriched = enrich_entry(entry, fetch=lambda *_a, _s=snapshot: _s)
        registry[slug] = {
            "provider": enriched.provider,
            "hf_repo_id": enriched.hf_repo_id,
            "attributes": dict(enriched.attributes),
            "provenance": dict(enriched.provenance),
        }
        audit.append({k: enriched.attributes.get(k) for k in _AUDIT_FACTS} | {"id": slug})

    doc = {
        "_comment": (
            "Generated by shared/corpus/ingest_hf.py from frozen hf_raw/ snapshots — "
            "do not hand-edit. Re-derive with: python shared/corpus/ingest_hf.py"
        ),
        "models": registry,
    }
    MODELS_PATH.write_text(
        json.dumps(doc, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(f"wrote {len(registry)} enriched models to {MODELS_PATH}")
    for row in audit:
        print(
            f"  {row['id']:14s} q={row.get('quality')!s:4} s={row.get('speed')!s:4} "
            f"c={row.get('cost')!s:4} ctx={row.get('context_window')}"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--fetch",
        action="store_true",
        help="hit HuggingFace and refresh hf_raw/ snapshots (network; needs [huggingface] extra)",
    )
    args = parser.parse_args()
    if args.fetch:
        fetch_all()
    derive_models()


if __name__ == "__main__":
    main()
