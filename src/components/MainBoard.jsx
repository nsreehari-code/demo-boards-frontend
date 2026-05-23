import React from 'react';
import { CentrePane } from './CentrePane.jsx';
import { IngestPane } from './IngestPane.jsx';
import { TruthsetExplorePane } from './TruthsetExplorePane.jsx';

const ingestFilter = (cardState) => cardState.cardContent?.meta?.ingest === true;
const truthsetExploreFilter = (cardState) => cardState.cardContent?.meta?.truthset === true;

export function MainBoard({ boardId }) {
  return (
    <>
      <IngestPane boardId={boardId} includeFilters={[ingestFilter]} layoutStrategy="vertical" />
      <TruthsetExplorePane boardId={boardId} includeFilters={[truthsetExploreFilter]} layoutStrategy="vertical" />
      <CentrePane boardId={boardId} excludeFilters={[ingestFilter, truthsetExploreFilter]} layoutStrategy="infinite-canvas" />
    </>
  );
}
