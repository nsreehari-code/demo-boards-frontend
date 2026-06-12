import { compileCardFilter } from './cardFilterExpression.js';

export const DEFAULT_PANE_PLACEMENT = [
  { pane: 'gandalf', when: 'meta.gandalf = true' },
  { pane: 'truthset', when: 'meta.truthset = true' },
];

export const DEFAULT_CARD_RENDERERS = [
  { renderer: 'protected', when: 'meta.highconfidential = true or meta.confidential = true' },
  { renderer: 'ingest', when: 'meta.ingest = true or meta.gandalf = true' },
];

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizePanePlacementRule(rule) {
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

function resolveLegacyPanePlacementConfig(uiConfig) {
  if (!isPlainObject(uiConfig)) return {};

  const preferredRules = uiConfig.paneRules;
  if (isPlainObject(preferredRules)) return preferredRules;

  const preferredFilters = uiConfig.paneFilters;
  if (isPlainObject(preferredFilters)) return preferredFilters;

  const camelCase = uiConfig.panePlacement;
  if (isPlainObject(camelCase)) return camelCase;

  const lowercase = uiConfig.panefilters;
  if (isPlainObject(lowercase)) return lowercase;

  const underscored = uiConfig.pane_placement;
  if (isPlainObject(underscored)) return underscored;

  const legacy = uiConfig.filters;
  if (isPlainObject(legacy)) return legacy;

  return {};
}

export function resolvePanePlacementConfig(uiConfig) {
  if (!isPlainObject(uiConfig)) return DEFAULT_PANE_PLACEMENT;

  const preferredRules = uiConfig.paneRules;
  if (Array.isArray(preferredRules)) {
    const normalized = preferredRules.map(normalizePanePlacementRule).filter(Boolean);
    return normalized.length > 0 ? normalized : DEFAULT_PANE_PLACEMENT;
  }

  const preferredPlacement = uiConfig.panePlacement;
  if (Array.isArray(preferredPlacement)) {
    const normalized = preferredPlacement.map(normalizePanePlacementRule).filter(Boolean);
    return normalized.length > 0 ? normalized : DEFAULT_PANE_PLACEMENT;
  }

  const underscored = uiConfig.pane_placement;
  if (Array.isArray(underscored)) {
    const normalized = underscored.map(normalizePanePlacementRule).filter(Boolean);
    return normalized.length > 0 ? normalized : DEFAULT_PANE_PLACEMENT;
  }

  const legacy = resolveLegacyPanePlacementConfig(uiConfig);
  const normalized = Object.entries(legacy)
    .map(([pane, when]) => normalizePanePlacementRule({ pane, when }))
    .filter(Boolean);
  return normalized.length > 0 ? normalized : DEFAULT_PANE_PLACEMENT;
}

export function resolvePaneFilters(uiConfig, name) {
  return resolvePanePlacementConfig(uiConfig)
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

export function resolveRendererConfig(uiConfig) {
  const preferredRules = uiConfig?.cardRendererRules;

  if (Array.isArray(preferredRules)) {
    const normalized = preferredRules.map(normalizeRendererRule).filter(Boolean);
    return normalized.length > 0 ? normalized : DEFAULT_CARD_RENDERERS;
  }

  if (isPlainObject(preferredRules)) {
    const normalized = Object.entries(preferredRules)
      .map(([renderer, when]) => normalizeRendererRule({ renderer, when }))
      .filter(Boolean);
    return normalized.length > 0 ? normalized : DEFAULT_CARD_RENDERERS;
  }

  const preferred = uiConfig?.cardRenderers;

  if (Array.isArray(preferred)) {
    const normalized = preferred.map(normalizeRendererRule).filter(Boolean);
    return normalized.length > 0 ? normalized : DEFAULT_CARD_RENDERERS;
  }

  if (isPlainObject(preferred)) {
    const normalized = Object.entries(preferred)
      .map(([renderer, when]) => normalizeRendererRule({ renderer, when }))
      .filter(Boolean);
    return normalized.length > 0 ? normalized : DEFAULT_CARD_RENDERERS;
  }

  const config = uiConfig?.renderers;

  if (Array.isArray(config)) {
    const normalized = config.map(normalizeRendererRule).filter(Boolean);
    return normalized.length > 0 ? normalized : DEFAULT_CARD_RENDERERS;
  }

  if (isPlainObject(config)) {
    const normalized = Object.entries(config)
      .map(([renderer, when]) => normalizeRendererRule({ renderer, when }))
      .filter(Boolean);
    return normalized.length > 0 ? normalized : DEFAULT_CARD_RENDERERS;
  }

  return DEFAULT_CARD_RENDERERS;
}

export function compileRendererRules(uiConfig) {
  return resolveRendererConfig(uiConfig)
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