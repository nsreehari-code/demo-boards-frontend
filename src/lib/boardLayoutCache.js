import { normalizeRuntimeCanvasLayout } from './boardCanvasLayout.js';

const BOARD_LAYOUT_CACHE_PREFIX = 'demo-board:layout-cache:';
const BOARD_LAYOUT_CACHE_VERSION = 1;

function resolveBoardLayoutCacheKey(boardId) {
  const normalizedBoardId = typeof boardId === 'string' ? boardId.trim() : '';
  return normalizedBoardId ? `${BOARD_LAYOUT_CACHE_PREFIX}${normalizedBoardId}` : '';
}

export function readCachedBoardLayout(boardId) {
  if (typeof window === 'undefined') return null;

  const key = resolveBoardLayoutCacheKey(boardId);
  if (!key) return null;

  try {
    const raw = window.localStorage?.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const candidate = parsed?.layout?.canvas ?? parsed?.layout ?? parsed?.canvas ?? parsed;
    const normalized = normalizeRuntimeCanvasLayout(candidate);
    return normalized ? { canvas: normalized } : null;
  } catch {
    return null;
  }
}

export function writeCachedBoardLayout(boardId, layout) {
  if (typeof window === 'undefined') return;

  const key = resolveBoardLayoutCacheKey(boardId);
  if (!key) return;

  const normalized = normalizeRuntimeCanvasLayout(layout?.canvas ?? layout);
  if (!normalized) return;

  try {
    window.localStorage?.setItem(key, JSON.stringify({
      version: BOARD_LAYOUT_CACHE_VERSION,
      updatedAt: Date.now(),
      layout: { canvas: normalized },
    }));
  } catch {
    // Ignore localStorage write failures.
  }
}
