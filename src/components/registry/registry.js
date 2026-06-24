// The single unified component registry, keyed by `kind` and shared across all
// tiers (board / pane / card / cardview). There is exactly one registry — no
// per-tier namespaces — so any kind is addressable from any slot.
//
// Entry shape (see docs-source-of-truth/four-tier-component-registry.md §1–§2):
//
//   {
//     kind: 'chart',
//     renderComponentFn: Chart,                 // rendered directly by the engine
//     requiredPropKeys: [],                     // soft validation
//     resolveKind:    (spec, data) => string,   // optional cross-entry redirect
//     defaultVariant: 'bar',
//     resolveVariant: (spec, data) => string,   // optional within-entry submode
//     meta: { showLabel: true, isReadonly: false },
//     childResolver:  (spec, namespaces) => childNode[],   // containers only
//     childKinds:     ['pane'],                 // OPTIONAL authoring hint only
//   }

import { cardViewEntries } from './cardview/index.js';
import { cardEntries } from './card/index.jsx';
import { paneEntries } from './pane/index.js';
import { boardEntries } from './board/index.js';
import { coerceUnknownData } from './lib/coerce.js';

export const FALLBACK_KIND = 'text';

const REGISTRY = new Map();

function register(entries) {
  for (const entry of entries ?? []) {
    if (!entry || typeof entry.kind !== 'string') continue;
    REGISTRY.set(entry.kind, entry);
  }
}

register(cardViewEntries);
register(cardEntries);
register(paneEntries);
register(boardEntries);

// Public API ---------------------------------------------------------------

export function registerEntries(entries) {
  register(entries);
}

export function lookupEntry(kind) {
  return REGISTRY.get(kind) ?? null;
}

// Resolves to the entry for `kind`, falling back to FALLBACK_KIND when unknown.
// Returns null only when even the fallback is not registered yet.
export function resolveEntry(kind) {
  return REGISTRY.get(kind) ?? REGISTRY.get(FALLBACK_KIND) ?? null;
}

export { REGISTRY, coerceUnknownData };
