import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseQuery } from './parser.js';
import { matchModel, normalizeScore } from './matcher.js';
import type { ModelAttributes } from '../types.js';

// The shared golden corpus is asserted by both the Python and TS suites, keeping
// the two matchers in lockstep. It is generated from the Python implementation
// via shared/corpus/generate.py.
const here = path.dirname(fileURLToPath(import.meta.url));
const corpusDir = path.resolve(here, '../../../../shared/corpus');

const parseDoc = JSON.parse(fs.readFileSync(path.join(corpusDir, 'parse.json'), 'utf-8'));
const matchDoc = JSON.parse(fs.readFileSync(path.join(corpusDir, 'match.json'), 'utf-8'));

describe('shared corpus: parse', () => {
  for (const c of parseDoc.cases) {
    const label = c.query === '' ? '<empty>' : c.query;
    it(`parses ${label}`, () => {
      if (c.error) {
        expect(() => parseQuery(c.query, c.aliases ?? {})).toThrow();
        return;
      }
      const parsed = parseQuery(c.query, c.aliases ?? {});
      const actual = parsed.conditions.map((cond) => ({
        attribute: cond.attribute,
        operator: cond.operator,
        value: cond.value,
        negated: cond.negated,
        weight: cond.weight,
      }));
      expect(actual).toEqual(c.conditions);
    });
  }
});

describe('shared corpus: match', () => {
  for (const c of matchDoc.cases) {
    it(`matches ${c.model} :: ${c.query}`, () => {
      const attrs = matchDoc.models[c.model] as ModelAttributes;
      const parsed = parseQuery(c.query, c.aliases ?? {});
      const result = matchModel(attrs, parsed);
      const exp = c.expected;
      expect(result.matches).toBe(exp.matches);
      expect(result.score).toBe(exp.score);
      expect(result.maxScore).toBe(exp.max_score);
      expect(normalizeScore(result)).toBeCloseTo(exp.normalized_score, 10);
      expect(result.exactMatch).toBe(exp.exact_match);
      expect(result.matchedAttributes).toEqual(exp.matched_attributes);
      expect(result.missingAttributes).toEqual(exp.missing_attributes);
    });
  }
});
