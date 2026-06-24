import React, { useContext } from 'react';
import { lookupEntry, resolveEntry, coerceUnknownData, FALLBACK_KIND } from '../registry.js';
import { resolveBind } from '../lib/bind.js';
import { RenderDepthContext, MAX_RENDER_DEPTH } from './recursion.js';

// NodeRenderer is the single resolver for every tier. It renders an entry's
// `renderComponentFn` directly — there is no per-kind adapter. Resolution order
// follows the locked contract §5:
//   visible -> kind (resolveKind) -> variant (resolveVariant) -> data/currentValue
//   -> validate -> inject status/services -> children (container) -> framing/key.
//
// Node shape: { kind, id?, label?, variant?, spec?, bind?, writeTo?, visible?,
//               data?, currentValue?, children? }. Instance metadata (id/label)
// is passed to the Component as one `meta` object — never as one-off props.
// `data`/`currentValue` may be pre-resolved by a host (e.g. CardCore) or
// resolved here from bind/writeTo.

function FallbackBox({ kind, data }) {
  return (
    <div className="board-card-frame__fallback small text-muted" role="note">
      <div>Unknown kind: <code>{String(kind)}</code></div>
      {data != null ? <pre className="mb-0">{coerceUnknownData(data)}</pre> : null}
    </div>
  );
}

function validateRequiredProps(entry, spec) {
  if (!import.meta.env?.DEV) return;
  if (!Array.isArray(entry.requiredPropKeys) || !entry.requiredPropKeys.length) return;
  for (const key of entry.requiredPropKeys) {
    if (spec == null || !(key in spec)) {
      // eslint-disable-next-line no-console
      console.warn(`[registry] entry "${entry.kind}" expects spec.${key}`);
    }
  }
}

function renderChildren(entry, spec, namespaces, ctx) {
  if (typeof entry.childResolver !== 'function') return ctx.children ?? null;
  const childNodes = entry.childResolver(spec, namespaces) ?? [];
  return childNodes.map((child, index) => (
    <NodeRenderer
      key={child?.key ?? child?.id ?? `${child?.kind ?? 'node'}-${index}`}
      node={child}
      namespaces={namespaces}
      services={ctx.services}
      onSave={ctx.onSave}
      status={ctx.status}
    />
  ));
}

export function NodeRenderer({ node, namespaces, services, onSave, status, children }) {
  const depth = useContext(RenderDepthContext);
  if (!node) return null;

  // 1. visibility gate
  if (node.visible && !resolveBind(namespaces, node.visible)) return null;

  const spec = node.spec ?? {};
  const rawData = node.data !== undefined
    ? node.data
    : (node.bind ? resolveBind(namespaces, node.bind) : undefined);

  // 2. kind, with optional cross-entry redirect (resolveKind)
  const requested = lookupEntry(node.kind);
  const effectiveKind = requested?.resolveKind?.(spec, rawData) ?? node.kind;
  const entry = resolveEntry(effectiveKind);

  if (!entry) {
    return (
      <div className="w-100 d-flex flex-column">
        <FallbackBox kind={effectiveKind} data={rawData} />
      </div>
    );
  }

  // registry-level fallback coercion when data falls through to the text kind
  const isFallback = entry.kind === FALLBACK_KIND && effectiveKind !== FALLBACK_KIND;
  const data = isFallback ? coerceUnknownData(rawData) : rawData;

  // 3. variant (within-entry submode; never swaps the Component)
  const variant = node.variant ?? entry.resolveVariant?.(spec, data) ?? entry.defaultVariant;

  // 4. currentValue for controlled-commit inputs
  const currentValue = node.currentValue !== undefined
    ? node.currentValue
    : (node.writeTo ? resolveBind(namespaces, node.writeTo) : undefined);

  // 5. soft validation
  validateRequiredProps(entry, spec);

  // 6/7. recursion guard, then children (container extension)
  if (depth >= MAX_RENDER_DEPTH) {
    return (
      <div className="w-100 d-flex flex-column">
        <FallbackBox kind={`${effectiveKind} (max depth ${MAX_RENDER_DEPTH})`} data={null} />
      </div>
    );
  }

  const Component = entry.renderComponentFn;
  const resolvedChildren = renderChildren(entry, spec, namespaces, {
    services, onSave, status, children,
  });

  // instance-level metadata (label, id, ...) travels as one `meta` object so the
  // prop contract never grows one-off props. This is the Instance lifetime and
  // is distinct from the registry entry's type-level `entry.meta` flags.
  const meta = { label: node.label, id: node.id };

  const rendered = (
    <RenderDepthContext.Provider value={depth + 1}>
      <Component
        spec={spec}
        meta={meta}
        variant={variant}
        data={data}
        currentValue={currentValue}
        writeTo={node.writeTo}
        onSave={onSave}
        status={status}
        services={services}
      >
        {resolvedChildren}
      </Component>
    </RenderDepthContext.Provider>
  );

  // `meta.bare` opts a kind out of the engine's column framing (label + w-100
  // wrappers) so higher tiers (card / pane / board) that own their own outer
  // shell render directly with no injected wrapper DOM.
  if (entry.meta?.bare) return rendered;

  // 8. own framing (meta.showLabel) + key are the engine's responsibility
  const showLabel = (entry.meta?.showLabel !== false) && !!node.label;

  return (
    <div className="w-100 d-flex flex-column">
      {showLabel ? <div className="board-card-frame__label mb-2">{node.label}</div> : null}
      <div>{rendered}</div>
    </div>
  );
}

export default NodeRenderer;
