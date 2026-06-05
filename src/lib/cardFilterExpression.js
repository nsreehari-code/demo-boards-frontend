/**
 * cardFilterExpression.js — compiles a JSONata filter expression into a
 * synchronous predicate over a card state.
 *
 * Expressions are JSONata strings evaluated against a card's `cardContent`
 * (e.g. "meta.truthset = true" reads cardState.cardContent.meta.truthset).
 * Uses yaml-flow's synchronous jsonata engine so it fits the sync filter
 * pipeline (panes evaluate filters during render).
 */

import { evaluateSync } from 'yaml-flow/compute-jsonata';

/**
 * Compile a JSONata filter expression into a predicate over a card state.
 * Accepts a string expression or an existing predicate function.
 * Returns null when the expression is empty or invalid.
 */
export function compileCardFilter(expression) {
  if (typeof expression === 'function') return expression;

  const expr = typeof expression === 'string' ? expression.trim() : '';
  if (!expr) return null;

  return (cardState) => {
    try {
      return evaluateSync(expr, cardState?.cardContent) === true;
    } catch {
      return false;
    }
  };
}
