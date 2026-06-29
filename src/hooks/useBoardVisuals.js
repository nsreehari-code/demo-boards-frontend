import { useCallback, useEffect, useMemo, useState } from 'react';
import { BOARD_TRANSPORT_MODE, BOARD_TRANSPORT_MODE_SERVER_URL, SERVER } from '../lib/appConfig.js';
import { resolveThemePackIdFromLayout } from '../lib/themePacks.js';
import { useManageBoards } from './useManageBoards.js';
import { useBoardLayoutActions, useBoardLayoutState } from './useCoordsState.jsx';
import { DEFAULT_PANE_KIND, useManagedBoardConfig } from './useManagedBoardConfig.js';

export function useBoardVisuals(boardId) {
  const { config, loading } = useManagedBoardConfig(boardId);
  const layoutState = useBoardLayoutState();
  const layoutActions = useBoardLayoutActions();
  const { manageBoardsActions } = useManageBoards(SERVER, { enabled: false });

  const shallowMerge = useCallback(async (key, value) => {
    const normalizedBoardId = typeof boardId === 'string' ? boardId.trim() : '';
    if (!normalizedBoardId || BOARD_TRANSPORT_MODE !== BOARD_TRANSPORT_MODE_SERVER_URL) {
      return null;
    }

    return manageBoardsActions.shallowMergeLayout(normalizedBoardId, key, value);
  }, [boardId, manageBoardsActions]);

  const actions = useMemo(() => ({
    ...layoutActions,
    shallowMerge,
  }), [layoutActions, shallowMerge]);

  const visuals = useMemo(() => {
    const ui = config?.ui ?? {};
    const layoutBlob = config?.layout ?? null;
    return {
      ui,
      layoutBlob,
      theme: resolveThemePackIdFromLayout(layoutBlob, ui),
      centrePaneKind: layoutBlob?.kind ?? DEFAULT_PANE_KIND,
      layoutState,
    };
  }, [config?.layout, config?.ui, layoutState]);

  return {
    visuals,
    actions,
    loading,
  };
}

export function useBoardVisual(boardId, key, fallbackValue = null) {
  const { visuals, actions, loading } = useBoardVisuals(boardId);

  const sourceValue = useMemo(() => {
    if (key === 'theme') {
      return visuals.theme ?? fallbackValue;
    }

    if (key === 'kind') {
      return visuals.centrePaneKind ?? fallbackValue;
    }

    if (!visuals.layoutBlob || typeof visuals.layoutBlob !== 'object' || Array.isArray(visuals.layoutBlob)) {
      return fallbackValue;
    }

    return visuals.layoutBlob[key] ?? fallbackValue;
  }, [fallbackValue, key, visuals.centrePaneKind, visuals.layoutBlob, visuals.theme]);

  const [value, setValueState] = useState(sourceValue);

  useEffect(() => {
    setValueState(sourceValue);
  }, [sourceValue, boardId, key]);

  const setValue = useCallback(async (nextValue) => {
    const previousValue = value;
    setValueState(nextValue);

    try {
      return await actions.shallowMerge(key, nextValue);
    } catch (error) {
      setValueState(previousValue);
      throw error;
    }
  }, [actions, key, value]);

  return [value, setValue, loading];
}