"""Lightweight end-to-end example: query -> select -> call OpenAI.

model-selector is *match-only*: you give it the models you have access to plus a
query, and it hands back the selected model id + match metadata. It never creates
a client. This script shows the full loop a host wires up:

    define models  ->  select_model(query)  ->  host calls OpenAI with the id

Run it:

    python examples/openai_demo.py                  # selection only, zero deps
    python examples/openai_demo.py "smart, fast"    # try your own query

To actually call OpenAI (the loop closure at the end):

    pip install -e .[examples]      # or: pip install openai
    export OPENAI_API_KEY=sk-...    # PowerShell: $env:OPENAI_API_KEY = "sk-..."
    python examples/openai_demo.py

Without a key (or without the openai package) the OpenAI call is skipped and the
script still demonstrates selection.
"""

from __future__ import annotations

import os
import sys

from model_selector import ModelRegistry, select_model, select_models

# The host owns its models. Here the registry id *is* the OpenAI model name, so
# the selected `model_id` drops straight into the API call with no id->name map.
# Attributes are on a rough 1-10 scale (cost/speed/quality); pick whatever your
# host cares to query on.
MODELS = [
    {
        "id": "gpt-4o",
        "provider": "openai",
        "attributes": {
            "cost": 8,
            "speed": 6,
            "quality": 9,
            "context_window": 128000,
            "functions": True,
            "reasoning": False,
            "local": False,
        },
    },
    {
        "id": "gpt-4o-mini",
        "provider": "openai",
        "attributes": {
            "cost": 2,
            "speed": 9,
            "quality": 6,
            "context_window": 128000,
            "functions": True,
            "reasoning": False,
            "local": False,
        },
    },
    {
        "id": "o3-mini",
        "provider": "openai",
        "attributes": {
            "cost": 5,
            "speed": 4,
            "quality": 9,
            "context_window": 200000,
            "functions": True,
            "reasoning": True,
            "local": False,
        },
    },
]

# Aliases turn host vocabulary into query conditions, expanded before parsing.
ALIASES = {
    "cheap": "cost <= 3",
    "fast": "speed >= 7",
    "smart": "quality >= 8",
    "reasoning": "reasoning",
}

# Queries are comma-separated AND conditions; earlier conditions weigh more.
DEMO_QUERIES = ["cheap, fast", "smart, fast", "reasoning, smart"]


def main() -> None:
    registry = ModelRegistry.from_models(MODELS, aliases=ALIASES)

    # Show how a few queries rank the same model set.
    print("Ranking demo queries against 3 OpenAI models:\n")
    for query in DEMO_QUERIES:
        ranked = select_models(query, registry, count=3)
        print(f"  query: {query!r}")
        for res in ranked:
            tag = "  (exact)" if res.exact_match else ""
            print(f"    {res.model_id:<14} score={res.normalized_score:.2f}{tag}")
        print()

    # Pick the model to actually use. Default query, or one passed on the CLI.
    query = sys.argv[1] if len(sys.argv) > 1 else "cheap, fast, functions"
    selected = select_model(query, registry)
    if selected is None:
        print(f"No model available for {query!r}.")
        return

    print(f"Selected for {query!r}: {selected.model_id} "
          f"(score={selected.normalized_score:.2f})")

    # --- Loop closure: the host instantiates the client with the chosen id. ---
    call_openai(selected.model_id)


def call_openai(model_id: str) -> None:
    """Call OpenAI with the selected model, or explain why it was skipped."""
    if not os.environ.get("OPENAI_API_KEY"):
        print("OpenAI call skipped (no OPENAI_API_KEY set).")
        return
    try:
        from openai import OpenAI
    except ImportError:
        print("OpenAI call skipped (openai not installed — `pip install openai`).")
        return

    client = OpenAI()
    response = client.chat.completions.create(
        model=model_id,
        messages=[{"role": "user", "content": "Say hello in one short sentence."}],
    )
    print(f"\n{model_id} says: {response.choices[0].message.content}")


if __name__ == "__main__":
    main()
