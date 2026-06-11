import { useEffect, useState } from 'react';
import {
  BOARD_TRANSPORT_MODE,
  BOARD_TRANSPORT_MODE_SERVER_URL,
  SERVER,
} from '../lib/appConfig.js';
import { normalizeRuntimeCanvasLayout } from '../lib/boardCanvasLayout.js';

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
      body: JSON.stringify({ subcommand: 'get-layout', args: { boardId: id } }),
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
    ui: board.ui && typeof board.ui === 'object' && !Array.isArray(board.ui) ? board.ui : {},
    metadata: board.metadata && typeof board.metadata === 'object' && !Array.isArray(board.metadata) ? board.metadata : {},
    layout: normalizeRuntimeCanvasLayout(layout?.canvas) ? { canvas: normalizeRuntimeCanvasLayout(layout?.canvas) } : null,
    board,
  };
}

export function useManagedBoardConfig(boardId) {
  const [managedBoardConfig, setManagedBoardConfig] = useState(null);

  useEffect(() => {
    if (!boardId) return undefined;
    if (BOARD_TRANSPORT_MODE !== BOARD_TRANSPORT_MODE_SERVER_URL) return undefined;

    let cancelled = false;
    fetchManagedBoardConfig(SERVER, boardId)
      .then((config) => {
        if (!cancelled) {
          setManagedBoardConfig(config);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setManagedBoardConfig(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [boardId]);

  return managedBoardConfig;
}