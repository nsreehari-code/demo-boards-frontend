// Pane tier resolution host. A consumer of the registry, dispatched by the
// engine as the generic `pane` kind (registered in registry/pane/index.jsx).
// It reads the pane's matching cards and *hides the pane when there is nothing
// to show* (centre is never gated — an empty board still shows its surface),
// otherwise delegates to the concrete `pane:<kind>`. Presence is resolved here,
// never stored as state in a hook/selector.

import React from 'react';
import { useBoardState } from '../../hooks/useBoardState.js';
import { NodeRenderer } from '../registry/engine/NodeRenderer.jsx';

export function PaneRenderer({ spec = {} }) {
  const { boardId, paneKind, includeFilters = [] } = spec;
  const board = useBoardState(boardId);

  // Presence gate: gandalf/truthset rails only exist when cards match their
  // filters; the centre surface always renders (it owns the empty-board state).
  if (paneKind !== 'centre' && (!board || board.filterCards(includeFilters).size === 0)) {
    return null;
  }

  return <NodeRenderer node={{ kind: `pane:${paneKind}`, spec }} />;
}
