import React, { useMemo } from 'react';
import { CentrePane } from './CentrePane.jsx';
import { GandalfPane } from './GandalfPane.jsx';
import { TruthsetExplorePane } from './TruthsetExplorePane.jsx';
import { BoardCoordsProvider } from '../hooks/useCoordsState.jsx';
import { useManagedBoardConfig, DEFAULT_PANE_KIND } from '../hooks/useManagedBoardConfig.js';
import { compileRendererRules, resolvePaneFilters } from '../lib/cardPresentationConfig.js';
import { BOARD_TRANSPORT_MODE, BOARD_TRANSPORT_MODE_SERVER_URL } from '../lib/appConfig.js';

export function MainBoard({ boardId }) {
  const { config: managedBoardConfig, loading: managedBoardConfigLoading } = useManagedBoardConfig(boardId);
  const uiConfig = managedBoardConfig?.ui ?? null;
  const boardLayout = managedBoardConfig?.layout ?? null;
  const centrePaneKind = boardLayout?.kind ?? DEFAULT_PANE_KIND;
  const holdCanvasUntilManagedConfig = BOARD_TRANSPORT_MODE === BOARD_TRANSPORT_MODE_SERVER_URL
    && managedBoardConfigLoading
    && !boardLayout;

  const { ingestFilters, truthsetFilters, centreExcludeFilters, rendererRules } = useMemo(() => {
    const ingest = resolvePaneFilters(uiConfig, 'gandalf');
    const truthset = resolvePaneFilters(uiConfig, 'truthset');
    return {
      ingestFilters: ingest,
      truthsetFilters: truthset,
      centreExcludeFilters: [...ingest, ...truthset],
      rendererRules: compileRendererRules(uiConfig),
    };
  }, [uiConfig]);

  return (
    <>
      <GandalfPane boardId={boardId} includeFilters={ingestFilters} layoutStrategy="vertical" rendererRules={rendererRules} />
      <TruthsetExplorePane boardId={boardId} includeFilters={truthsetFilters} layoutStrategy="vertical" rendererRules={rendererRules} />
      {holdCanvasUntilManagedConfig ? null : (
        <BoardCoordsProvider boardId={boardId} initialLayout={boardLayout}>
          <CentrePane
            boardId={boardId}
            excludeFilters={centreExcludeFilters}
            layoutStrategy={centrePaneKind}
            rendererRules={rendererRules}
          />
        </BoardCoordsProvider>
      )}
    </>
  );
}
