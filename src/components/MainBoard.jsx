import React, { useMemo } from 'react';
import { useManagedBoardConfig, DEFAULT_PANE_KIND } from '../hooks/useManagedBoardConfig.js';
import { compileRendererRules, resolvePaneFilters } from '../lib/cardPresentationConfig.js';
import { BOARD_TRANSPORT_MODE, BOARD_TRANSPORT_MODE_SERVER_URL } from '../lib/appConfig.js';
import { NodeRenderer } from './registry/engine/NodeRenderer.jsx';

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

  // Host-level composition: derive the pane node set, then let the engine
  // render the board (a board entry is just a childResolver over spec.panes).
  const panes = [
    { kind: 'pane:gandalf', spec: { boardId, includeFilters: ingestFilters, layoutStrategy: 'vertical', rendererRules } },
    { kind: 'pane:truthset', spec: { boardId, includeFilters: truthsetFilters, layoutStrategy: 'vertical', rendererRules } },
  ];
  if (!holdCanvasUntilManagedConfig) {
    panes.push({
      kind: 'pane:centre',
      spec: {
        boardId,
        excludeFilters: centreExcludeFilters,
        layoutStrategy: centrePaneKind,
        rendererRules,
        initialLayout: boardLayout,
      },
    });
  }

  return <NodeRenderer node={{ kind: 'board:default', spec: { boardId, panes } }} />;
}
