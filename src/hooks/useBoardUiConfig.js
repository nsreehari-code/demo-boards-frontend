import { useEffect, useState } from 'react';
import {
  BOARD_TRANSPORT_MODE,
  BOARD_TRANSPORT_MODE_SERVER_URL,
  SERVER,
} from '../lib/appConfig.js';

async function fetchBoardUi(serverOrigin, boardId) {
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
  const ui = payload?.data?.board?.ui;
  return ui && typeof ui === 'object' && !Array.isArray(ui) ? ui : {};
}

/**
 * Loads the board's resolved `ui` template (filters etc.) from the controlface
 * `get-board` endpoint. Only runs in server-url transport mode; returns null
 * otherwise (callers fall back to built-in defaults).
 */
export function useBoardUiConfig(boardId) {
  const [uiConfig, setUiConfig] = useState(null);

  useEffect(() => {
    if (!boardId) return undefined;
    if (BOARD_TRANSPORT_MODE !== BOARD_TRANSPORT_MODE_SERVER_URL) return undefined;

    let cancelled = false;
    fetchBoardUi(SERVER, boardId)
      .then((ui) => { if (!cancelled) setUiConfig(ui); })
      .catch(() => { if (!cancelled) setUiConfig(null); });

    return () => { cancelled = true; };
  }, [boardId]);

  return uiConfig;
}
