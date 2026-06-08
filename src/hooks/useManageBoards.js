import { useCallback, useEffect, useMemo, useState } from 'react';

function normalizeOrigin(serverOrigin) {
  return typeof serverOrigin === 'string'
    ? serverOrigin.trim().replace(/\/+$/, '')
    : '';
}

function normalizeManagedBoardEntries(payload) {
  const boards = Array.isArray(payload?.boards) ? payload.boards : [];
  return boards
    .map((board) => normalizeManagedBoardEntry(board))
    .filter(Boolean);
}

function normalizeManagedBoardEntry(board) {
  const id = typeof board?.id === 'string' ? board.id.trim() : '';
  const label = typeof board?.label === 'string' ? board.label.trim() : '';
  if (!id) return null;
  return {
    id,
    label: label || id,
    ai: typeof board?.ai === 'string' ? board.ai.trim() : '',
    aiWorkspaceTemplate: typeof board?.aiWorkspaceTemplate === 'string' ? board.aiWorkspaceTemplate.trim() : '',
    uiTemplate: typeof board?.uiTemplate === 'string' ? board.uiTemplate.trim() : '',
    refsTemplate: typeof board?.refsTemplate === 'string' ? board.refsTemplate.trim() : '',
    metadata: board?.metadata && typeof board.metadata === 'object' && !Array.isArray(board.metadata)
      ? board.metadata
      : {},
  };
}

async function postManageBoards(serverOrigin, payload) {
  const normalizedOrigin = normalizeOrigin(serverOrigin);
  if (!normalizedOrigin) {
    throw new Error('Server origin is required');
  }

  const response = await fetch(`${normalizedOrigin}/manage-boards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.status !== 'success') {
    const message = typeof data?.error === 'string' && data.error.trim()
      ? data.error.trim()
      : `Manage boards failed: ${response.status}`;
    throw new Error(message);
  }
  return data?.data ?? null;
}

function normalizeBoardCandidate(candidate) {
  return {
    boardId: typeof candidate?.boardId === 'string' ? candidate.boardId.trim() : '',
    label: typeof candidate?.label === 'string' ? candidate.label.trim() : '',
    pageTitle: typeof candidate?.pageTitle === 'string' ? candidate.pageTitle.trim() : '',
    pageSubtitle: typeof candidate?.pageSubtitle === 'string' ? candidate.pageSubtitle.trim() : '',
    ai: typeof candidate?.ai === 'string' ? candidate.ai.trim() : '',
    aiWorkspaceTemplate: typeof candidate?.aiWorkspaceTemplate === 'string' ? candidate.aiWorkspaceTemplate.trim() : '',
    uiTemplate: typeof candidate?.uiTemplate === 'string' ? candidate.uiTemplate.trim() : '',
    refsTemplate: typeof candidate?.refsTemplate === 'string' ? candidate.refsTemplate.trim() : '',
  };
}

export function useManageBoards(serverOrigin, options = {}) {
  const { enabled = true, reloadDelayMs = 250 } = options;
  const normalizedOrigin = useMemo(() => normalizeOrigin(serverOrigin), [serverOrigin]);
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const listBoards = useCallback(async () => {
    if (!normalizedOrigin) {
      setBoards([]);
      setError('');
      return [];
    }

    setLoading(true);
    setError('');
    try {
      const data = await postManageBoards(normalizedOrigin, { subcommand: 'list-boards' });
      const nextBoards = normalizeManagedBoardEntries(data);
      setBoards(nextBoards);
      return nextBoards;
    } catch (nextError) {
      setBoards([]);
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      throw nextError;
    } finally {
      setLoading(false);
    }
  }, [normalizedOrigin]);

  const addBoard = useCallback(async (candidate) => {
    const normalized = normalizeBoardCandidate(candidate);
    if (!normalized.boardId) throw new Error('Board id is required');
    if (!normalized.label) throw new Error('Label is required');
    if (!normalized.pageTitle) throw new Error('Page title is required');
    if (!normalized.pageSubtitle) throw new Error('Page subtitle is required');
    if (!normalized.ai) throw new Error('AI is required');
    if (!normalized.aiWorkspaceTemplate) throw new Error('AI workspace template is required');
    if (!normalized.uiTemplate) throw new Error('UI template is required');
    if (!normalized.refsTemplate) throw new Error('Refs template is required');

    const data = await postManageBoards(normalizedOrigin, {
      subcommand: 'add-board',
      args: {
        boardId: normalized.boardId,
        record: {
          label: normalized.label,
          ai: normalized.ai,
          aiWorkspaceTemplate: normalized.aiWorkspaceTemplate,
          uiTemplate: normalized.uiTemplate,
          refsTemplate: normalized.refsTemplate,
          metadata: {
            ...(normalized.pageTitle ? { pageTitle: normalized.pageTitle } : {}),
            ...(normalized.pageSubtitle ? { pageSubtitle: normalized.pageSubtitle } : {}),
          },
        },
      },
    });

    await listBoards();
    return normalizeManagedBoardEntry(data?.board ?? null);
  }, [listBoards, normalizedOrigin]);

  const saveBoardMeta = useCallback(async (boardId, metadata) => {
    const normalizedBoardId = typeof boardId === 'string' ? boardId.trim() : '';
    if (!normalizedBoardId) {
      throw new Error('Board id is required');
    }

    const data = await postManageBoards(normalizedOrigin, {
      subcommand: 'save-meta',
      args: {
        boardId: normalizedBoardId,
        metadata,
      },
    });
    return normalizeManagedBoardEntry(data?.board ?? null);
  }, [normalizedOrigin]);

  const saveBoardRecord = useCallback(async (boardId, record) => {
    const normalizedBoardId = typeof boardId === 'string' ? boardId.trim() : '';
    if (!normalizedBoardId) {
      throw new Error('Board id is required');
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('Record is required');
    }

    const data = await postManageBoards(normalizedOrigin, {
      subcommand: 'save-board-record',
      args: {
        boardId: normalizedBoardId,
        record,
      },
    });
    await listBoards();
    return normalizeManagedBoardEntry(data?.board ?? null);
  }, [listBoards, normalizedOrigin]);

  const exportBoard = useCallback(async (boardId) => {
    const normalizedBoardId = typeof boardId === 'string' ? boardId.trim() : '';
    if (!normalizedBoardId) {
      throw new Error('Board id is required');
    }

    const data = await postManageBoards(normalizedOrigin, {
      subcommand: 'export-board',
      args: {
        boardId: normalizedBoardId,
      },
    });
    return data?.payload ?? null;
  }, [normalizedOrigin]);

  const previewImportBoard = useCallback(async (boardId, payload, mode = 'replace') => {
    const normalizedBoardId = typeof boardId === 'string' ? boardId.trim() : '';
    if (!normalizedBoardId) {
      throw new Error('Board id is required');
    }

    const data = await postManageBoards(normalizedOrigin, {
      subcommand: 'preview-import-board',
      args: {
        boardId: normalizedBoardId,
        payload,
        mode,
      },
    });
    return data?.preview ?? null;
  }, [normalizedOrigin]);

  const applyImportBoard = useCallback(async (boardId, payload, { mode = 'replace', applyBoardMetadata = false } = {}) => {
    const normalizedBoardId = typeof boardId === 'string' ? boardId.trim() : '';
    if (!normalizedBoardId) {
      throw new Error('Board id is required');
    }

    const data = await postManageBoards(normalizedOrigin, {
      subcommand: 'apply-import-board',
      args: {
        boardId: normalizedBoardId,
        payload,
        mode,
        applyBoardMetadata,
      },
    });
    return data ?? null;
  }, [normalizedOrigin]);

  const refreshBoard = useCallback(async (boardId) => {
    const normalizedBoardId = typeof boardId === 'string' ? boardId.trim() : '';
    if (!normalizedBoardId) {
      throw new Error('Board id is required');
    }

    const data = await postManageBoards(normalizedOrigin, {
      subcommand: 'refresh-board',
      args: {
        boardId: normalizedBoardId,
      },
    });
    await listBoards();
    return normalizeManagedBoardEntry(data?.board ?? null);
  }, [listBoards, normalizedOrigin]);

  useEffect(() => {
    if (!enabled || !normalizedOrigin) {
      setBoards([]);
      setLoading(false);
      setError('');
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void listBoards().catch(() => {});
    }, reloadDelayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [enabled, listBoards, normalizedOrigin, reloadDelayMs]);

  const manageBoardsActions = useMemo(() => ({
    listBoards,
    addBoard,
    getBoard: async (boardId) => {
      const normalizedBoardId = typeof boardId === 'string' ? boardId.trim() : '';
      if (!normalizedBoardId) {
        throw new Error('Board id is required');
      }

      const data = await postManageBoards(normalizedOrigin, {
        subcommand: 'get-board',
        args: {
          boardId: normalizedBoardId,
        },
      });
      return normalizeManagedBoardEntry(data?.board ?? null);
    },
    saveBoardMeta,
    saveBoardRecord,
    refreshBoard,
    exportBoard,
    previewImportBoard,
    applyImportBoard,
  }), [addBoard, applyImportBoard, exportBoard, listBoards, normalizedOrigin, previewImportBoard, refreshBoard, saveBoardMeta, saveBoardRecord]);

  return {
    managedBoards: boards,
    loadingManagedBoards: loading,
    manageBoardsError: error,
    manageBoardsActions,
  };
}