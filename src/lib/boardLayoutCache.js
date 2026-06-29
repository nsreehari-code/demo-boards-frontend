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
    const candidateLayout = parsed?.layout && typeof parsed.layout === 'object' && !Array.isArray(parsed.layout)
      ? parsed.layout
      : (parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null);
    const candidateCanvas = candidateLayout?.canvas ?? parsed?.canvas ?? candidateLayout;
    const normalized = normalizeRuntimeCanvasLayout(candidateCanvas);
    if (!normalized) {
      return null;
    }

    const nextLayout = { canvas: normalized };
    if (candidateLayout && typeof candidateLayout === 'object' && !Array.isArray(candidateLayout)) {
      for (const [key, value] of Object.entries(candidateLayout)) {
        if (key === 'canvas') {
          continue;
        }

        nextLayout[key] = value;
      }
    }

    return nextLayout;
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

  const existingLayout = readCachedBoardLayout(boardId) ?? {};
  const nextLayout = {
    ...existingLayout,
    ...(layout && typeof layout === 'object' && !Array.isArray(layout) ? layout : {}),
    canvas: normalized,
  };

  try {
    window.localStorage?.setItem(key, JSON.stringify({
      version: BOARD_LAYOUT_CACHE_VERSION,
      updatedAt: Date.now(),
      layout: nextLayout,
    }));
  } catch {
    // Ignore localStorage write failures.
  }
}
