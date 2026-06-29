// Board tier resolution host. Lives outside `registry/` because it is a
// *consumer* of the registry, not an entry in it: it reads the managed board
// config (data) and resolves the board into a node tree, delegating to
// NodeRenderer. Keeping the renderers out of the tier barrels keeps the
// dependency direction one-way (renderers → registry, never back), which is what
// prevents the registry-init import cycle.
//
// Pane resolution is config-driven: filters, centre layout kind, renderer rules,
// and whether the centre canvas is held during load. Panes are emitted as
// generic `pane` host nodes; PaneRenderer decides presence (hides empty rails)
// and delegates to the concrete `pane:<kind>`. The board entry is just a
// childResolver over `spec.panes`.

import React, { memo, useMemo } from 'react';
import { useBoardVisuals } from '../../hooks/useBoardVisuals.js';
import { compileRendererRules, resolvePaneFilters } from '../../lib/cardPresentationConfig.js';
import { BOARD_TRANSPORT_MODE, BOARD_TRANSPORT_MODE_SERVER_URL } from '../../lib/appConfig.js';
import { NodeRenderer } from '../registry/engine/NodeRenderer.jsx';

function BoardRendererComponent({ boardId }) {
  const { visuals, loading: managedBoardConfigLoading } = useBoardVisuals(boardId);
  const uiConfig = visuals.ui;
  const boardLayout = visuals.layoutBlob;
  const centrePaneKind = visuals.centrePaneKind;
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

  const panes = [
    { kind: 'pane', spec: { boardId, paneKind: 'gandalf', includeFilters: ingestFilters, layoutStrategy: 'vertical', rendererRules } },
    { kind: 'pane', spec: { boardId, paneKind: 'truthset', includeFilters: truthsetFilters, layoutStrategy: 'vertical', rendererRules } },
  ];
  if (!holdCanvasUntilManagedConfig) {
    panes.push({
      kind: 'pane',
      spec: {
        boardId,
        paneKind: 'centre',
        excludeFilters: centreExcludeFilters,
        layoutStrategy: centrePaneKind,
        rendererRules,
        initialLayout: boardLayout,
      },
    });
  }

  return <NodeRenderer node={{ kind: 'board:default', spec: { boardId, panes } }} />;
}

export const BoardRenderer = memo(BoardRendererComponent);
