import { useEffect, useState } from 'react';
import {
  BOARD_TRANSPORT_MODE,
  BOARD_TRANSPORT_MODE_SERVER_URL,
  SERVER,
} from '../lib/appConfig.js';

async function fetchManagedBoardConfig(serverOrigin, boardId) {
  const origin = typeof serverOrigin === 'string' ? serverOrigin.trim().replace(/\/+$/, '') : '';
  const id = typeof boardId === 'string' ? boardId.trim() : '';
  if (!origin || !id) return null;

  const response = await fetch(`${origin}/manage-boards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subcommand: 'get-board', args: { boardId: id } }),
  });
  if (!response.ok) {
    throw new Error(`get-board failed: ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.status !== 'success') {
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'get-board failed');
  }

  const board = payload?.data?.board;
  if (!board || typeof board !== 'object' || Array.isArray(board)) {
    return null;
  }

  return {
    ui: board.ui && typeof board.ui === 'object' && !Array.isArray(board.ui) ? board.ui : {},
    metadata: board.metadata && typeof board.metadata === 'object' && !Array.isArray(board.metadata) ? board.metadata : {},
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