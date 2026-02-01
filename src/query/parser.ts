import {
  AttributeValue,
  ComparisonOperator,
  ParsedQuery,
  QueryCondition,
  Aliases,
} from '../types.js';

/**
 * Parse a single query token into a condition.
 *
 * Supported formats:
 * - `attribute` -> attribute = true
 * - `!attribute` -> attribute = false
 * - `attribute = value` -> exact match
 * - `attribute >= 5` -> numeric comparison
 * - `attribute:weight` -> with custom weight (e.g., "local:10")
 */
function parseToken(token: string, position: number, totalConditions: number): QueryCondition {
  const trimmed = token.trim();

  // Check for custom weight suffix (e.g., "local:10")
  let weight = totalConditions - position; // Default: position-based weight
  let conditionPart = trimmed;

  const weightMatch = trimmed.match(/^(.+):(\d+)$/);
  if (weightMatch) {
    conditionPart = weightMatch[1]!.trim();
    weight = parseInt(weightMatch[2]!, 10);
  }

  // Check for negation prefix
  let negated = false;
  if (conditionPart.startsWith('!')) {
    negated = true;
    conditionPart = conditionPart.slice(1).trim();
  }

  // Try to parse comparison operators
  const comparisonMatch = conditionPart.match(
    /^([a-z_][a-z0-9_]*)\s*(>=|<=|!=|>|<|=)\s*(.+)$/i
  );

  if (comparisonMatch) {
    const attribute = comparisonMatch[1]!;
    const operator = comparisonMatch[2] as ComparisonOperator;
    const rawValue = comparisonMatch[3]!.trim();
    const value = parseValue(rawValue);

    return {
      attribute,
      operator,
      value,
      negated,
      weight,
    };
  }

  // Simple boolean attribute (e.g., "local" or "!local")
  if (/^[a-z_][a-z0-9_]*$/i.test(conditionPart)) {
    return {
      attribute: conditionPart,
      operator: '=',
      value: true,
      negated,
      weight,
    };
  }

  throw new Error(`Invalid query condition: "${trimmed}"`);
}

/**
 * Parse a value string into the appropriate type.
 */
function parseValue(rawValue: string): AttributeValue {
  // Boolean
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;

  // Number
  const num = Number(rawValue);
  if (!isNaN(num)) return num;

  // String (remove quotes if present)
  if ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))) {
    return rawValue.slice(1, -1);
  }

  return rawValue;
}

/**
 * Expand aliases in a query string.
 */
function expandAliases(query: string, aliases: Aliases): string {
  let expanded = query;

  // Split by comma, expand each token, rejoin
  const tokens = expanded.split(',').map((t) => t.trim());
  const expandedTokens = tokens.map((token) => {
    // Check if this token (without weight suffix) is an alias
    const weightMatch = token.match(/^(.+):(\d+)$/);
    const baseToken = weightMatch ? weightMatch[1]!.trim() : token;
    const weightSuffix = weightMatch ? `:${weightMatch[2]}` : '';

    // Check for negation
    const negated = baseToken.startsWith('!');
    const lookupToken = negated ? baseToken.slice(1) : baseToken;

    if (aliases[lookupToken]) {
      // Expand the alias
      let aliasValue = aliases[lookupToken]!;
      // If negated, we need to handle this specially
      if (negated) {
        // For simple boolean aliases, negate them
        // For comparison aliases, this might not make sense - just prepend !
        aliasValue = `!(${aliasValue})`;
      }
      return aliasValue + weightSuffix;
    }

    return token;
  });

  return expandedTokens.join(', ');
}

/**
 * Parse a query string into a structured ParsedQuery.
 *
 * Query syntax:
 * - Comma-separated conditions (AND logic)
 * - Boolean: `local`, `!local`, `functions`
 * - Comparisons: `cost <= 5`, `speed >= 7`, `context_window >= 32000`
 * - Equality: `provider = openai`
 * - Custom weights: `local:10, fast:5`
 *
 * Position-based weighting: first condition gets highest weight by default.
 */
export function parseQuery(query: string, aliases: Aliases = {}): ParsedQuery {
  // Expand aliases first
  const expandedQuery = expandAliases(query, aliases);

  // Split by comma
  const tokens = expandedQuery.split(',').map((t) => t.trim()).filter((t) => t.length > 0);

  if (tokens.length === 0) {
    throw new Error('Empty query');
  }

  const conditions = tokens.map((token, index) =>
    parseToken(token, index, tokens.length)
  );

  return { conditions };
}
