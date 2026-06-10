import React, { useMemo } from 'react';
import { CentrePane } from './CentrePane.jsx';
import { IngestPane } from './IngestPane.jsx';
import { TruthsetExplorePane } from './TruthsetExplorePane.jsx';
import { useManagedBoardConfig } from '../hooks/useManagedBoardConfig.js';
import { compileCardFilter } from '../lib/cardFilterExpression.js';

const DEFAULT_FILTERS = {
  gandalf: 'meta.gandalf = true',
  truthset: 'meta.truthset = true',
};

function resolveFilters(uiFilters, name) {
  const compiled = compileCardFilter(uiFilters?.[name] ?? DEFAULT_FILTERS[name]);
  return compiled ? [compiled] : [];
}

export function MainBoard({ boardId }) {
  const managedBoardConfig = useManagedBoardConfig(boardId);
  const uiConfig = managedBoardConfig?.ui ?? null;
  const boardMetadata = managedBoardConfig?.metadata ?? null;

  const { ingestFilters, truthsetFilters, centreExcludeFilters } = useMemo(() => {
    const uiFilters = uiConfig?.filters;
    const ingest = resolveFilters(uiFilters, 'gandalf');
    const truthset = resolveFilters(uiFilters, 'truthset');
    return {
      ingestFilters: ingest,
      truthsetFilters: truthset,
      centreExcludeFilters: [...ingest, ...truthset],
    };
  }, [uiConfig]);

  return (
    <>
      <IngestPane boardId={boardId} includeFilters={ingestFilters} layoutStrategy="vertical" />
      <TruthsetExplorePane boardId={boardId} includeFilters={truthsetFilters} layoutStrategy="vertical" />
      <CentrePane
        boardId={boardId}
        excludeFilters={centreExcludeFilters}
        layoutStrategy="infinite-canvas"
        boardUi={uiConfig}
        boardMetadata={boardMetadata}
      />
    </>
  );
}
