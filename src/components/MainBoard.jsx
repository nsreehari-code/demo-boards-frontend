import React from 'react';
import { CentrePane } from './CentrePane.jsx';
import { IngestPane } from './IngestPane.jsx';
import { TruthsetExplorePane } from './TruthsetExplorePane.jsx';

const ingestFilter = (cardState) => cardState.cardContent?.meta?.ingest === true;
const truthsetExploreFilter = (cardState) => cardState.cardContent?.meta?.truthset === true;
const INGEST_FILTERS = [ingestFilter];
const TRUTHSET_EXPLORE_FILTERS = [truthsetExploreFilter];
const CENTRE_EXCLUDE_FILTERS = [ingestFilter, truthsetExploreFilter];

export function MainBoard({ boardId }) {
  return (
    <>
      <IngestPane boardId={boardId} includeFilters={INGEST_FILTERS} layoutStrategy="vertical" />
      <TruthsetExplorePane boardId={boardId} includeFilters={TRUTHSET_EXPLORE_FILTERS} layoutStrategy="vertical" />
      <CentrePane boardId={boardId} excludeFilters={CENTRE_EXCLUDE_FILTERS} layoutStrategy="infinite-canvas" />
    </>
  );
}
