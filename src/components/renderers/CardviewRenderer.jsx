// Cardview tier resolution host. Like the other renderers, it is a *consumer*
// of the registry (not an entry): it reads card state (data), builds the binding
// namespaces, resolves the card's `view.elements` into leaf nodes
// (normalizeElement → buildLayoutNode → resolveRefKind) and dispatches each
// through NodeRenderer. It also owns the data plumbing a view needs — bind /
// writeTo patching, file-URL resolution, and the optimistic save/overlay cycle.
//
// Living outside `registry/` keeps the dependency direction one-way
// (renderers → registry): card components (CardShell, StrategistCard) compose it
// the same way panes compose CardRenderer.

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ensureCardFileUrl, getCardFileUrl } from '../../lib/client.js';
import { useCardState } from '../../hooks/useCardState.js';
import { NodeRenderer } from '../registry/engine/NodeRenderer.jsx';
import { deepSet } from '../registry/lib/path.js';
import { resolveBind } from '../registry/lib/bind.js';
import { deepEqual } from '../registry/lib/coerce.js';

function buildNamespaces(boardId, cardState) {
  return {
    boardId,
    card: cardState.cardContent ?? {},
    card_data: cardState.cardData ?? {},
    requires: cardState.requiresDataObjects ?? {},
    computed_values: cardState.cardRuntime?.computed_values ?? {},
    runtime_state: cardState.cardRuntime?.runtime ?? {},
  };
}

function buildUpstreamSignature(cardState) {
  return JSON.stringify({
    boardSseClientId: cardState.boardSseClientId ?? null,
    cardContent: cardState.cardContent ?? null,
    cardRuntime: cardState.cardRuntime ?? null,
  });
}

function resolveRefKind(namespaces, element, initialData) {
  const viewRaw = element?.data?.viewBind ? resolveBind(namespaces, element.data.viewBind) : undefined;
  if (typeof viewRaw === 'string' && viewRaw) return viewRaw;
  if (viewRaw && typeof viewRaw === 'object' && !Array.isArray(viewRaw) && typeof viewRaw.kind === 'string') {
    return viewRaw.kind;
  }
  if (element?.data?.fallbackKind) return element.data.fallbackKind;
  if (Array.isArray(initialData)) return 'table';
  if (typeof initialData === 'string') return 'text';
  return 'narrative';
}

function normalizeElement(namespaces, element) {
  const baseData = element?.data?.bind ? resolveBind(namespaces, element.data.bind) : undefined;

  if (element?.kind !== 'ref') {
    return { kind: element.kind, renderDef: element, data: baseData };
  }

  const viewRaw = element?.data?.viewBind ? resolveBind(namespaces, element.data.viewBind) : undefined;
  const resolvedExtra = viewRaw && typeof viewRaw === 'object' && !Array.isArray(viewRaw)
    ? (viewRaw.data && typeof viewRaw.data === 'object' ? viewRaw.data : {})
    : {};

  const mergedData = { ...resolvedExtra, ...(element.data ?? {}) };
  delete mergedData.viewBind;
  delete mergedData.fallbackKind;

  if (!mergedData.bind && resolvedExtra.bind) mergedData.bind = resolvedExtra.bind;

  const effectiveData = mergedData.bind ? resolveBind(namespaces, mergedData.bind) : baseData;
  const resolvedKind = resolveRefKind(namespaces, element, effectiveData);

  return {
    kind: resolvedKind,
    renderDef: {
      ...element,
      kind: resolvedKind,
      data: mergedData,
    },
    data: effectiveData,
  };
}

function buildLayoutNode(namespaces, element, index) {
  const normalized = normalizeElement(namespaces, element);
  const mergedData = normalized.renderDef?.data ?? {};

  // spec is the component's own (open) vocabulary; bind/writeTo are engine wiring
  // and live at the node top level, so strip them out of spec.
  const spec = { ...mergedData };
  delete spec.bind;
  delete spec.writeTo;

  const bind = mergedData.bind ?? null;
  const writeTo = mergedData.writeTo ?? null;
  const reactKey = element?.id
    ?? bind
    ?? writeTo
    ?? element?.label
    ?? `${normalized.kind}-${element?.className ?? 'col-12'}-${index}`;

  return {
    reactKey,
    containerClassName: element?.className ?? 'col-12',
    containerStyle: element?.containerStyle ?? null,
    node: {
      kind: normalized.kind,
      id: element?.id,
      label: element?.label,
      spec,
      bind,
      writeTo,
      data: normalized.data,
    },
  };
}

function buildFileUrl(boardId, cardId, index, file) {
  if (!file?.stored_name) return null;
  return getCardFileUrl(boardId, cardId, index, file.stored_name);
}

async function patchCardDataValue(cardActions, cardData, writeTo, value) {
  if (!cardActions?.patch) return;

  if (writeTo === 'card_data') {
    const nextCardData = value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(cardData ?? {}), ...value }
      : value;
    if (deepEqual(cardData ?? {}, nextCardData)) return;
    await cardActions.patch({ card_data: nextCardData });
    return;
  }

  if (writeTo && writeTo.startsWith('card_data.')) {
    const fieldPath = writeTo.slice('card_data.'.length);
    const nextCardData = deepSet(cardData ?? {}, fieldPath, value);
    if (deepEqual(cardData ?? {}, nextCardData)) return;
    await cardActions.patch({ card_data: nextCardData });
  }
}

function CardviewRendererComponent({ boardId, cardId }) {
  const cardState = useCardState(boardId, cardId);
  const [saving, setSaving] = useState(false);
  const [fileUrlVersion, setFileUrlVersion] = useState(0);
  const pendingUpstreamSignatureRef = useRef(null);

  if (!cardState?.cardContent) return null;

  const card = cardState.cardContent;
  const view = card.view;
  if (!view?.elements?.length) return null;

  const cardActions = cardState.cardActions;
  const cardData = cardState.cardData;
  const cardFieldValues = cardState.cardContent?.fieldValues;
  const upstreamSignature = useMemo(() => buildUpstreamSignature(cardState), [
    cardState.boardSseClientId,
    cardState.cardContent,
    cardState.cardRuntime,
  ]);

  const namespaces = useMemo(() => buildNamespaces(boardId, cardState), [
    boardId,
    cardState.cardContent,
    cardState.cardData,
    cardState.requiresDataObjects,
    cardState.cardRuntime,
  ]);

  const layoutNodes = useMemo(() => view.elements
    .filter((element) => {
      if (!element.visible) return true;
      return !!resolveBind(namespaces, element.visible);
    })
    .map((element, index) => buildLayoutNode(namespaces, element, index)), [namespaces, view.elements]);

  const fileUrlForIndex = useCallback((index, file) => {
    const href = buildFileUrl(boardId, cardId, index, file);
    if (!href && file?.stored_name) {
      void ensureCardFileUrl(boardId, cardId, index, file.stored_name)
        .then((resolved) => {
          if (resolved) setFileUrlVersion((value) => value + 1);
        })
        .catch(() => {});
    }
    return href;
  }, [boardId, cardId, fileUrlVersion]);

  const services = useMemo(() => ({ fileUrlForIndex }), [fileUrlForIndex]);

  useEffect(() => {
    if (!saving) return;
    if (!pendingUpstreamSignatureRef.current) return;
    if (upstreamSignature === pendingUpstreamSignatureRef.current) return;
    pendingUpstreamSignatureRef.current = null;
    setSaving(false);
  }, [saving, upstreamSignature]);

  const beginSaving = useCallback(() => {
    pendingUpstreamSignatureRef.current = upstreamSignature;
    setSaving(true);
  }, [upstreamSignature]);

  const handleSave = useCallback(async (value, meta = {}) => {
    if (!cardActions || saving) return;

    try {
      if (meta.kind === 'actions' && meta.buttonId) {
        beginSaving();
        await cardActions.dispatchAction?.('action', {
          buttonId: meta.buttonId,
          elemId: meta.elemId,
        });
        return;
      }

      const writeTo = meta.writeTo;
      if (writeTo === 'card_data' || (writeTo && writeTo.startsWith('card_data.'))) {
        const nextCardData = writeTo === 'card_data'
          ? (value && typeof value === 'object' && !Array.isArray(value)
            ? { ...(cardData ?? {}), ...value }
            : value)
          : deepSet(cardData ?? {}, writeTo.slice('card_data.'.length), value);
        if (deepEqual(cardData ?? {}, nextCardData)) return;
        beginSaving();
        await patchCardDataValue(cardActions, cardData, writeTo, value);
        return;
      }

      if (meta.kind === 'notes') {
        if (deepEqual(cardData?.notes ?? '', value ?? '')) return;
        beginSaving();
        await cardActions.patch({ card_data: { ...(cardData ?? {}), notes: value } });
        return;
      }

      if (deepEqual(cardFieldValues, value)) return;

      beginSaving();
      await cardActions.patch({ fieldValues: value });
    } catch (error) {
      pendingUpstreamSignatureRef.current = null;
      setSaving(false);
      throw error;
    }
  }, [beginSaving, cardActions, cardData, cardFieldValues, saving]);

  return (
    <div className="board-card-core position-relative" aria-busy={saving}>
      <div className="row g-2 align-content-start">
        {layoutNodes.map(({ reactKey, containerClassName, containerStyle, node }) => (
          <div
            key={reactKey}
            className={containerClassName}
            style={containerStyle ?? undefined}
          >
            <NodeRenderer
              node={node}
              namespaces={namespaces}
              services={services}
              onSave={handleSave}
            />
          </div>
        ))}
      </div>
      {saving ? (
        <div className="board-card-core__overlay" aria-hidden="true">
          <div className="board-card-core__overlay-spinner">
            <span className="spinner-border" role="status" aria-hidden="true" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const CardviewRenderer = memo(CardviewRendererComponent);
