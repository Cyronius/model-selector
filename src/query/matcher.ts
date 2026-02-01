import {
  AttributeValue,
  ComparisonOperator,
  ModelAttributes,
  QueryCondition,
  ParsedQuery,
} from '../types.js';

/**
 * Check if a single condition matches against model attributes.
 */
function evaluateCondition(
  condition: QueryCondition,
  attributes: ModelAttributes
): boolean {
  const attrValue = attributes[condition.attribute];

  // If attribute doesn't exist, condition fails
  if (attrValue === undefined) {
    return condition.negated; // Negated missing attribute = true
  }

  let result: boolean;

  switch (condition.operator) {
    case '=':
      result = attrValue === condition.value;
      break;
    case '!=':
      result = attrValue !== condition.value;
      break;
    case '>':
      result = typeof attrValue === 'number' && typeof condition.value === 'number'
        ? attrValue > condition.value
        : false;
      break;
    case '>=':
      result = typeof attrValue === 'number' && typeof condition.value === 'number'
        ? attrValue >= condition.value
        : false;
      break;
    case '<':
      result = typeof attrValue === 'number' && typeof condition.value === 'number'
        ? attrValue < condition.value
        : false;
      break;
    case '<=':
      result = typeof attrValue === 'number' && typeof condition.value === 'number'
        ? attrValue <= condition.value
        : false;
      break;
    default:
      result = false;
  }

  return condition.negated ? !result : result;
}

export interface MatchResult {
  matches: boolean;
  score: number;
  maxScore: number;
  exactMatch: boolean;
  matchedAttributes: string[];
  missingAttributes: string[];
}

/**
 * Match a model's attributes against a parsed query.
 * Returns a score and match details.
 */
export function matchModel(
  attributes: ModelAttributes,
  query: ParsedQuery
): MatchResult {
  const matchedAttributes: string[] = [];
  const missingAttributes: string[] = [];
  let score = 0;
  let maxScore = 0;

  for (const condition of query.conditions) {
    maxScore += condition.weight;

    if (evaluateCondition(condition, attributes)) {
      score += condition.weight;
      matchedAttributes.push(condition.attribute);
    } else {
      missingAttributes.push(condition.attribute);
    }
  }

  const exactMatch = score === maxScore;

  return {
    matches: score > 0, // At least one condition matched
    score,
    maxScore,
    exactMatch,
    matchedAttributes,
    missingAttributes,
  };
}

/**
 * Get a normalized score (0-1) from a match result.
 */
export function normalizeScore(result: MatchResult): number {
  if (result.maxScore === 0) return 0;
  return result.score / result.maxScore;
}
