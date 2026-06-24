import { describe, it, expect } from 'vitest';
import { parseQuery } from './parser.js';

describe('parseQuery', () => {
  describe('boolean attributes', () => {
    it('parses simple boolean attribute as true', () => {
      const result = parseQuery('local');
      expect(result.conditions).toHaveLength(1);
      expect(result.conditions[0]).toMatchObject({
        attribute: 'local',
        operator: '=',
        value: true,
        negated: false,
      });
    });

    it('parses negated boolean attribute', () => {
      const result = parseQuery('!local');
      expect(result.conditions).toHaveLength(1);
      expect(result.conditions[0]).toMatchObject({
        attribute: 'local',
        operator: '=',
        value: true,
        negated: true,
      });
    });

    it('parses multiple boolean attributes', () => {
      const result = parseQuery('local, functions, reasoning');
      expect(result.conditions).toHaveLength(3);
      expect(result.conditions[0]?.attribute).toBe('local');
      expect(result.conditions[1]?.attribute).toBe('functions');
      expect(result.conditions[2]?.attribute).toBe('reasoning');
    });
  });

  describe('numeric comparisons', () => {
    it('parses >= comparison', () => {
      const result = parseQuery('context_window >= 32000');
      expect(result.conditions[0]).toMatchObject({
        attribute: 'context_window',
        operator: '>=',
        value: 32000,
      });
    });

    it('parses <= comparison', () => {
      const result = parseQuery('cost <= 5');
      expect(result.conditions[0]).toMatchObject({
        attribute: 'cost',
        operator: '<=',
        value: 5,
      });
    });

    it('parses > comparison', () => {
      const result = parseQuery('speed > 7');
      expect(result.conditions[0]).toMatchObject({
        attribute: 'speed',
        operator: '>',
        value: 7,
      });
    });

    it('parses < comparison', () => {
      const result = parseQuery('cost < 3');
      expect(result.conditions[0]).toMatchObject({
        attribute: 'cost',
        operator: '<',
        value: 3,
      });
    });

    it('parses large numeric values', () => {
      const result = parseQuery('context_window >= 100000');
      expect(result.conditions[0]).toMatchObject({
        attribute: 'context_window',
        operator: '>=',
        value: 100000,
      });
    });
  });

  describe('equality comparisons', () => {
    it('parses string equality', () => {
      const result = parseQuery('provider = openai');
      expect(result.conditions[0]).toMatchObject({
        attribute: 'provider',
        operator: '=',
        value: 'openai',
      });
    });

    it('parses inequality', () => {
      const result = parseQuery('provider != google');
      expect(result.conditions[0]).toMatchObject({
        attribute: 'provider',
        operator: '!=',
        value: 'google',
      });
    });

    it('parses quoted string values', () => {
      const result = parseQuery('provider = "openai"');
      expect(result.conditions[0]).toMatchObject({
        attribute: 'provider',
        value: 'openai',
      });
    });
  });

  describe('combined queries', () => {
    it('parses mixed boolean and numeric conditions', () => {
      const result = parseQuery('local, context_window >= 32000, functions');
      expect(result.conditions).toHaveLength(3);
      expect(result.conditions[0]?.attribute).toBe('local');
      expect(result.conditions[1]?.attribute).toBe('context_window');
      expect(result.conditions[1]?.operator).toBe('>=');
      expect(result.conditions[1]?.value).toBe(32000);
      expect(result.conditions[2]?.attribute).toBe('functions');
    });

    it('parses complex query with multiple comparison types', () => {
      const result = parseQuery('cost <= 5, speed >= 7, functions, !local');
      expect(result.conditions).toHaveLength(4);
      expect(result.conditions[0]).toMatchObject({ attribute: 'cost', operator: '<=', value: 5 });
      expect(result.conditions[1]).toMatchObject({ attribute: 'speed', operator: '>=', value: 7 });
      expect(result.conditions[2]).toMatchObject({ attribute: 'functions', value: true });
      expect(result.conditions[3]).toMatchObject({ attribute: 'local', negated: true });
    });
  });

  describe('position-based weights', () => {
    it('assigns higher weight to earlier conditions', () => {
      const result = parseQuery('first, second, third');
      // With 3 conditions, weights are: 3, 2, 1 (based on position)
      expect(result.conditions[0]?.weight).toBe(3);
      expect(result.conditions[1]?.weight).toBe(2);
      expect(result.conditions[2]?.weight).toBe(1);
    });

    it('allows custom weight override', () => {
      const result = parseQuery('cheap:10, fast:5, local:3');
      expect(result.conditions[0]?.weight).toBe(10);
      expect(result.conditions[1]?.weight).toBe(5);
      expect(result.conditions[2]?.weight).toBe(3);
    });
  });

  describe('aliases', () => {
    it('expands simple aliases', () => {
      const aliases = { fast: 'speed >= 7' };
      const result = parseQuery('fast', aliases);
      expect(result.conditions[0]).toMatchObject({
        attribute: 'speed',
        operator: '>=',
        value: 7,
      });
    });

    it('expands multiple aliases', () => {
      const aliases = {
        fast: 'speed >= 7',
        cheap: 'cost <= 3',
      };
      const result = parseQuery('fast, cheap', aliases);
      expect(result.conditions).toHaveLength(2);
      expect(result.conditions[0]?.attribute).toBe('speed');
      expect(result.conditions[1]?.attribute).toBe('cost');
    });
  });

  describe('error handling', () => {
    it('throws on empty query', () => {
      expect(() => parseQuery('')).toThrow('Empty query');
    });

    it('throws on invalid syntax', () => {
      expect(() => parseQuery('123invalid')).toThrow('Invalid query condition');
    });
  });
});
