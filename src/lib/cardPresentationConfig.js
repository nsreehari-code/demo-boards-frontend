import { compileCardFilter } from './cardFilterExpression.js';

export const DEFAULT_PANE_RULES = [
  { pane: 'gandalf', when: 'meta.gandalf = true' },
  { pane: 'truthset', when: 'meta.truthset = true' },
];

export const DEFAULT_CARD_RENDERER_RULES = [
  { renderer: 'ingest', when: 'meta.ingest = true or meta.gandalf = true' },
];

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizePaneRule(rule) {
  if (!rule || !isPlainObject(rule)) return null;

  const pane = typeof rule.pane === 'string'
    ? rule.pane.trim()
    : typeof rule.name === 'string'
      ? rule.name.trim()
      : '';

  if (!pane) return null;

  return {
    pane,
    when: typeof rule.when === 'function' || typeof rule.when === 'string' ? rule.when : null,
  };
}

export function resolvePaneRulesConfig(uiConfig) {
  if (!isPlainObject(uiConfig)) return DEFAULT_PANE_RULES;

  const preferredRules = uiConfig.paneRules;
  if (Array.isArray(preferredRules)) {
    const normalized = preferredRules.map(normalizePaneRule).filter(Boolean);
    return normalized.length > 0 ? normalized : DEFAULT_PANE_RULES;
  }

  return DEFAULT_PANE_RULES;
}

export function resolvePaneFilters(uiConfig, name) {
  return resolvePaneRulesConfig(uiConfig)
    .filter((rule) => rule.pane === name)
    .map((rule) => {
      const matcher = rule.when == null ? () => true : compileCardFilter(rule.when);
      return typeof matcher === 'function' ? matcher : null;
    })
    .filter(Boolean);
}

function normalizeRendererRule(rule) {
  if (!rule) return null;

  if (typeof rule === 'string') {
    return { renderer: rule, when: null };
  }

  if (!isPlainObject(rule)) return null;

  const renderer = typeof rule.renderer === 'string'
    ? rule.renderer.trim()
    : typeof rule.name === 'string'
      ? rule.name.trim()
      : '';

  if (!renderer) return null;

  return {
    renderer,
    when: typeof rule.when === 'function' || typeof rule.when === 'string' ? rule.when : null,
  };
}

export function resolveCardRendererRulesConfig(uiConfig) {
  const preferredRules = uiConfig?.cardRendererRules;

  if (Array.isArray(preferredRules)) {
    const normalized = preferredRules.map(normalizeRendererRule).filter(Boolean);
    return normalized.length > 0 ? normalized : DEFAULT_CARD_RENDERER_RULES;
  }

  if (isPlainObject(preferredRules)) {
    const normalized = Object.entries(preferredRules)
      .map(([renderer, when]) => normalizeRendererRule({ renderer, when }))
      .filter(Boolean);
    return normalized.length > 0 ? normalized : DEFAULT_CARD_RENDERER_RULES;
  }

  return DEFAULT_CARD_RENDERER_RULES;
}

export function compileRendererRules(uiConfig) {
  return resolveCardRendererRulesConfig(uiConfig)
    .map((rule) => {
      const matcher = rule.when == null ? () => true : compileCardFilter(rule.when);
      if (typeof matcher !== 'function') return null;
      return {
        renderer: rule.renderer,
        matches: matcher,
      };
    })
    .filter(Boolean);
}

export function resolveCardRenderer(cardState, rendererRules = []) {
  for (const rule of rendererRules) {
    try {
      if (rule.matches(cardState)) {
        return rule.renderer;
      }
    } catch {
      // Ignore a broken rule and keep evaluating the remaining renderers.
    }
  }

  return 'default';
}
