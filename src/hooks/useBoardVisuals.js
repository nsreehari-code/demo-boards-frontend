import { useMemo } from 'react';
import { resolveThemePackIdFromUi } from '../lib/themePacks.js';
import { useBoardLayoutActions, useBoardLayoutState } from './useCoordsState.jsx';
import { DEFAULT_PANE_KIND, useManagedBoardConfig } from './useManagedBoardConfig.js';

export function useBoardVisuals(boardId) {
  const { config, loading } = useManagedBoardConfig(boardId);
  const layoutState = useBoardLayoutState();
  const actions = useBoardLayoutActions();

  const visuals = useMemo(() => {
    const ui = config?.ui ?? {};
    const layoutBlob = config?.layout ?? null;
    return {
      ui,
      layoutBlob,
      theme: resolveThemePackIdFromUi(ui),
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