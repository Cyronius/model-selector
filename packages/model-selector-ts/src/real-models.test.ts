import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rankModels } from './index.js';
import type { Config, ModelConfig } from './types.js';

// Real popular-model registry, ingested from HuggingFace into the shared corpus by
// shared/corpus/ingest_hf.py. The Python suite asserts the same selections over the
// same data (test_real_models.py), so both implementations agree on real models.
//
// Traces: MSEL-SELECT-RANK, MSEL-CORPUS
const here = path.dirname(fileURLToPath(import.meta.url));
const modelsDoc = JSON.parse(
  fs.readFileSync(path.resolve(here, '../../../shared/corpus/models.json'), 'utf-8')
);

const models: Record<string, ModelConfig> = {};
for (const [id, entry] of Object.entries(modelsDoc.models as Record<string, any>)) {
  // Keep provider top-level; rankModels folds it into matchable attributes.
  models[id] = {
    provider: entry.provider,
    hf_repo_id: entry.hf_repo_id,
    attributes: entry.attributes,
    enabled: true,
  };
}

const config: Config = {
  aliases: { cheap: 'cost <= 3', fast: 'speed >= 7' },
  models,
};

const matchedIds = (query: string): Set<string> =>
  new Set(
    rankModels(query, config)
      .filter((r) => r.matches)
      .map((r) => r.modelId)
  );

describe('real models: registry', () => {
  it('ingested the expected popular models', () => {
    expect(Object.keys(models).length).toBe(11);
    for (const id of ['llama-3.1-8b', 'mixtral-8x7b', 'deepseek-v3', 'kimi-k2']) {
      expect(models[id]).toBeDefined();
    }
  });
});

describe('real models: selection (parity with Python)', () => {
  it('selects only long-context models for >= 100k', () => {
    expect(matchedIds('context_window >= 100000')).toEqual(
      new Set(['phi-3.5-mini', 'deepseek-v3', 'kimi-k2'])
    );
  });

  it('selects only the highest-quality MoE models for quality >= 9', () => {
    expect(matchedIds('quality >= 9')).toEqual(new Set(['deepseek-v3', 'kimi-k2']));
  });

  it('filters by provider', () => {
    expect(matchedIds('provider = qwen')).toEqual(new Set(['qwen2.5-7b', 'qwen2.5-72b']));
  });

  it('cheap + fast has a unique exact winner', () => {
    const best = rankModels('cheap, fast', config)[0];
    expect(best?.modelId).toBe('phi-3.5-mini');
    expect(best?.exactMatch).toBe(true);
  });

  it('ranks a high-quality MoE above a small model for a quality query', () => {
    const ranked = rankModels('quality >= 8', config).map((r) => r.modelId);
    expect(ranked.indexOf('deepseek-v3')).toBeLessThan(ranked.indexOf('phi-3.5-mini'));
  });
});
