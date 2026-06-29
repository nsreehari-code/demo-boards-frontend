import { useEffect, useState } from 'react';
import {
  BOARD_TRANSPORT_MODE,
  BOARD_TRANSPORT_MODE_SERVER_URL,
  SERVER,
} from '../lib/appConfig.js';
import { normalizeRuntimeCanvasLayout } from '../lib/boardCanvasLayout.js';
import { readCachedBoardLayout, writeCachedBoardLayout } from '../lib/boardLayoutCache.js';

function stableStringify(value) {
  if (value == null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  const keys = Object.keys(value).sort((left, right) => left.localeCompare(right));
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function normalizeUi(ui) {
  return ui && typeof ui === 'object' && !Array.isArray(ui) ? ui : {};
}

function normalizeMetadata(metadata) {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
}

// The layout payload describes the centre pane: its kind (canvas vs flowing
// cards) alongside its card coordinates. `kind` is therefore the centre pane's
// layout kind, not a board-level kind. Boards without an explicit kind default
// to the infinite-canvas pane.
export const DEFAULT_PANE_KIND = 'infinite-canvas';

function normalizePaneKind(kind) {
  return typeof kind === 'string' && kind.trim() ? kind.trim() : DEFAULT_PANE_KIND;
}

function normalizeLayout(layout) {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return null;
  const kind = normalizePaneKind(layout.kind);
  const normalizedCanvas = normalizeRuntimeCanvasLayout(layout.canvas ?? layout);
  return { kind, canvas: normalizedCanvas ?? null };
}

function resolveNextManagedBoardConfig(current, candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return current === null ? current : null;
  }

  const nextUiRaw = normalizeUi(candidate.ui);
  const nextMetadataRaw = normalizeMetadata(candidate.metadata);
  const nextLayoutRaw = normalizeLayout(candidate.layout);

  const currentUiHash = stableStringify(current?.ui ?? {});
  const nextUiHash = stableStringify(nextUiRaw);
  const resolvedUi = current && currentUiHash === nextUiHash ? current.ui : nextUiRaw;

  const currentMetadataHash = stableStringify(current?.metadata ?? {});
  const nextMetadataHash = stableStringify(nextMetadataRaw);
  const resolvedMetadata = current && currentMetadataHash === nextMetadataHash ? current.metadata : nextMetadataRaw;

  const currentLayoutHash = stableStringify(current?.layout ?? null);
  const nextLayoutHash = stableStringify(nextLayoutRaw ?? null);
  const resolvedLayout = current && currentLayoutHash === nextLayoutHash ? current.layout : nextLayoutRaw;

  if (current && currentLayoutHash === nextLayoutHash && current.ui === resolvedUi) {
    // Strict no-op: same layout hash and same ui reference means no meaningful config change.
    return current;
  }

  const resolvedBoard = current && stableStringify(current.board ?? null) === stableStringify(candidate.board ?? null)
    ? current.board
    : (candidate.board ?? null);

  return {
    ui: resolvedUi,
    metadata: resolvedMetadata,
    layout: resolvedLayout,
    board: resolvedBoard,
  };
}

async function fetchManagedBoardConfig(serverOrigin, boardId) {
  const origin = typeof serverOrigin === 'string' ? serverOrigin.trim().replace(/\/+$/, '') : '';
  const id = typeof boardId === 'string' ? boardId.trim() : '';
  if (!origin || !id) return null;

  const [boardResponse, layoutResponse] = await Promise.all([
    fetch(`${origin}/manage-boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subcommand: 'get-board', args: { boardId: id } }),
    }),
    fetch(`${origin}/manage-boards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subcommand: 'get-layout', args: { boardId: id, ns: 'frontend' } }),
    }),
  ]);
  if (!boardResponse.ok) {
    throw new Error(`get-board failed: ${boardResponse.status}`);
  }
  if (!layoutResponse.ok) {
    throw new Error(`get-layout failed: ${layoutResponse.status}`);
  }

  const payload = await boardResponse.json();
  const layoutPayload = await layoutResponse.json();
  if (payload?.status !== 'success') {
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'get-board failed');
  }
  if (layoutPayload?.status !== 'success') {
    throw new Error(typeof layoutPayload?.error === 'string' ? layoutPayload.error : 'get-layout failed');
  }

  const board = payload?.data?.board;
  if (!board || typeof board !== 'object' || Array.isArray(board)) {
    return null;
  }

  const layout = layoutPayload?.data?.layout;

  return {
    ui: normalizeUi(board.ui),
    metadata: normalizeMetadata(board.metadata),
    layout: normalizeLayout(layout),
    board,
  };
}

export function useManagedBoardConfig(boardId) {
  const [managedBoardConfig, setManagedBoardConfig] = useState(() => {
    if (BOARD_TRANSPORT_MODE !== BOARD_TRANSPORT_MODE_SERVER_URL) {
      return null;
    }

    const cachedLayout = readCachedBoardLayout(boardId);
    if (!cachedLayout) {
      return null;
    }

    return {
      ui: {},
      metadata: {},
      layout: cachedLayout,
      board: null,
    };
  });
  const [loading, setLoading] = useState(BOARD_TRANSPORT_MODE === BOARD_TRANSPORT_MODE_SERVER_URL);

  useEffect(() => {
    if (!boardId) return undefined;
    if (BOARD_TRANSPORT_MODE !== BOARD_TRANSPORT_MODE_SERVER_URL) {
      setLoading(false);
      return undefined;
    }

    const cachedLayout = readCachedBoardLayout(boardId);
    if (cachedLayout) {
      setManagedBoardConfig((current) => resolveNextManagedBoardConfig(current, {
        ui: current?.ui ?? {},
        metadata: current?.metadata ?? {},
        layout: cachedLayout,
        board: current?.board ?? null,
      }));
    }

    let cancelled = false;
    setLoading(true);
    fetchManagedBoardConfig(SERVER, boardId)
      .then((config) => {
        if (!cancelled) {
          if (config?.layout) {
            writeCachedBoardLayout(boardId, config.layout);
          }
          setManagedBoardConfig((current) => resolveNextManagedBoardConfig(current, config));
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setManagedBoardConfig(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [boardId]);

  return {
    config: managedBoardConfig,
    loading,
  };
}