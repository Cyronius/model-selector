import { describe, it, expect } from 'vitest';
import { matchModel, normalizeScore } from './matcher.js';
import { parseQuery } from './parser.js';
import { ModelAttributes } from '../types.js';

// Test model configurations
const gpt4: ModelAttributes = {
  context_window: 128000,
  cost: 8,
  speed: 6,
  functions: true,
  local: false,
  provider: 'openai',
};

const gpt4mini: ModelAttributes = {
  context_window: 128000,
  cost: 2,
  speed: 9,
  functions: true,
  local: false,
  provider: 'openai',
};

const llama3: ModelAttributes = {
  context_window: 8192,
  cost: 0,
  speed: 7,
  functions: false,
  local: true,
  provider: 'ollama',
};

describe('matchModel', () => {
  describe('boolean attributes', () => {
    it('matches local=true', () => {
      const query = parseQuery('local');
      expect(matchModel(llama3, query).exactMatch).toBe(true);
      expect(matchModel(gpt4, query).exactMatch).toBe(false);
    });

    it('matches !local (negated)', () => {
      const query = parseQuery('!local');
      expect(matchModel(gpt4, query).exactMatch).toBe(true);
      expect(matchModel(gpt4mini, query).exactMatch).toBe(true);
      expect(matchModel(llama3, query).exactMatch).toBe(false);
    });

    it('matches functions=true', () => {
      const query = parseQuery('functions');
      expect(matchModel(gpt4, query).exactMatch).toBe(true);
      expect(matchModel(gpt4mini, query).exactMatch).toBe(true);
      expect(matchModel(llama3, query).exactMatch).toBe(false);
    });

    it('matches !local, functions', () => {
      const query = parseQuery('!local, functions');
      expect(matchModel(gpt4, query).exactMatch).toBe(true);
      expect(matchModel(gpt4mini, query).exactMatch).toBe(true);
      expect(matchModel(llama3, query).exactMatch).toBe(false);
    });
  });

  describe('numeric comparisons', () => {
    it('matches context_window >= 32000', () => {
      const query = parseQuery('context_window >= 32000');
      expect(matchModel(gpt4, query).exactMatch).toBe(true);
      expect(matchModel(gpt4mini, query).exactMatch).toBe(true);
      expect(matchModel(llama3, query).exactMatch).toBe(false);
    });

    it('matches context_window >= 100000', () => {
      const query = parseQuery('context_window >= 100000');
      expect(matchModel(gpt4, query).exactMatch).toBe(true);
      expect(matchModel(gpt4mini, query).exactMatch).toBe(true);
      expect(matchModel(llama3, query).exactMatch).toBe(false);
    });

    it('matches cost <= 3', () => {
      const query = parseQuery('cost <= 3');
      expect(matchModel(gpt4, query).exactMatch).toBe(false);
      expect(matchModel(gpt4mini, query).exactMatch).toBe(true);
      expect(matchModel(llama3, query).exactMatch).toBe(true);
    });

    it('matches speed >= 8', () => {
      const query = parseQuery('speed >= 8');
      expect(matchModel(gpt4, query).exactMatch).toBe(false);
      expect(matchModel(gpt4mini, query).exactMatch).toBe(true);
      expect(matchModel(llama3, query).exactMatch).toBe(false);
    });

    it('matches cost = 0', () => {
      const query = parseQuery('cost = 0');
      expect(matchModel(gpt4, query).exactMatch).toBe(false);
      expect(matchModel(llama3, query).exactMatch).toBe(true);
    });
  });

  describe('combined queries', () => {
    it('matches cost <= 5, speed >= 7, functions', () => {
      const query = parseQuery('cost <= 5, speed >= 7, functions');
      // gpt4mini: cost=2 (yes), speed=9 (yes), functions=true (yes) -> exact match
      expect(matchModel(gpt4mini, query).exactMatch).toBe(true);
      // gpt4: cost=8 (no), speed=6 (no), functions=true (yes) -> partial
      expect(matchModel(gpt4, query).exactMatch).toBe(false);
      // llama3: cost=0 (yes), speed=7 (yes), functions=false (no) -> partial
      expect(matchModel(llama3, query).exactMatch).toBe(false);
    });

    it('matches local, cost <= 1', () => {
      const query = parseQuery('local, cost <= 1');
      // llama3: local=true, cost=0 -> exact match
      expect(matchModel(llama3, query).exactMatch).toBe(true);
      // gpt4: local=false, cost=8 -> no match
      expect(matchModel(gpt4, query).exactMatch).toBe(false);
    });

    it('matches cost <= 3, context_window >= 100000', () => {
      const query = parseQuery('cost <= 3, context_window >= 100000');
      // gpt4mini: cost=2 (yes), context_window=128000 (yes) -> exact
      expect(matchModel(gpt4mini, query).exactMatch).toBe(true);
      // llama3: cost=0 (yes), context_window=8192 (no) -> partial
      expect(matchModel(llama3, query).exactMatch).toBe(false);
    });
  });

  describe('partial matches', () => {
    it('returns partial match for local, context_window >= 100000', () => {
      const query = parseQuery('local, context_window >= 100000');

      // llama3: local=true (yes), context_window=8192 (no) -> partial
      const llama3Result = matchModel(llama3, query);
      expect(llama3Result.exactMatch).toBe(false);
      expect(llama3Result.matchedAttributes).toContain('local');
      expect(llama3Result.missingAttributes).toContain('context_window');

      // gpt4: local=false (no), context_window=128000 (yes) -> partial
      const gpt4Result = matchModel(gpt4, query);
      expect(gpt4Result.exactMatch).toBe(false);
      expect(gpt4Result.matchedAttributes).toContain('context_window');
      expect(gpt4Result.missingAttributes).toContain('local');
    });

    it('scores partial matches correctly', () => {
      const query = parseQuery('local, functions, speed >= 7');

      // llama3: local=true (yes), functions=false (no), speed=7 (yes) -> 2/3
      const llama3Result = matchModel(llama3, query);
      expect(llama3Result.matchedAttributes).toHaveLength(2);
      expect(llama3Result.missingAttributes).toHaveLength(1);

      // gpt4mini: local=false (no), functions=true (yes), speed=9 (yes) -> 2/3
      const gpt4miniResult = matchModel(gpt4mini, query);
      expect(gpt4miniResult.matchedAttributes).toHaveLength(2);
      expect(gpt4miniResult.missingAttributes).toHaveLength(1);
    });
  });

  describe('scoring with weights', () => {
    it('uses position-based weights for scoring', () => {
      // First attribute gets weight 3, second 2, third 1
      const query = parseQuery('local, functions, speed >= 7');

      // llama3: local (3) + speed (1) = 4/6
      const llama3Result = matchModel(llama3, query);
      const llama3Score = normalizeScore(llama3Result);

      // gpt4mini: functions (2) + speed (1) = 3/6
      const gpt4miniResult = matchModel(gpt4mini, query);
      const gpt4miniScore = normalizeScore(gpt4miniResult);

      // llama3 should score higher because it matches 'local' which has higher weight
      expect(llama3Score).toBeGreaterThan(gpt4miniScore);
    });

    it('respects custom weights', () => {
      // Custom weights: functions=10, local=1
      const query = parseQuery('functions:10, local:1');

      // llama3: functions=false (0), local=true (1) -> 1/11
      const llama3Result = matchModel(llama3, query);
      const llama3Score = normalizeScore(llama3Result);

      // gpt4: functions=true (10), local=false (0) -> 10/11
      const gpt4Result = matchModel(gpt4, query);
      const gpt4Score = normalizeScore(gpt4Result);

      // gpt4 should score much higher due to functions having weight 10
      expect(gpt4Score).toBeGreaterThan(llama3Score);
      expect(gpt4Score).toBeCloseTo(10/11, 2);
      expect(llama3Score).toBeCloseTo(1/11, 2);
    });
  });

  describe('string equality', () => {
    it('matches provider = openai', () => {
      const query = parseQuery('provider = openai');
      expect(matchModel(gpt4, query).exactMatch).toBe(true);
      expect(matchModel(llama3, query).exactMatch).toBe(false);
    });

    it('matches provider != google', () => {
      const query = parseQuery('provider != google');
      expect(matchModel(gpt4, query).exactMatch).toBe(true);
      expect(matchModel(llama3, query).exactMatch).toBe(true);
    });
  });

  describe('missing attributes', () => {
    it('fails match for missing attribute', () => {
      const query = parseQuery('reasoning');
      // None of our test models have 'reasoning' attribute
      expect(matchModel(gpt4, query).exactMatch).toBe(false);
      expect(matchModel(llama3, query).exactMatch).toBe(false);
    });

    it('passes match for negated missing attribute', () => {
      const query = parseQuery('!reasoning');
      // Missing attribute + negation = true (attribute is not present and we want it not present)
      expect(matchModel(gpt4, query).exactMatch).toBe(true);
    });
  });
});
