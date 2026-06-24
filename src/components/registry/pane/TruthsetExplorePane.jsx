import React from 'react';
import { usePaneState } from '../../../hooks/usePaneState.js';
import { CardRenderer } from '../../renderers/CardRenderer.jsx';
import { PanelVertical } from '../../shared/PanelVertical.jsx';

function TruthsetExploreNav({ cards, idx, onPrev, onNext }) {
  const card = cards[idx];
  const title = card?.meta?.title ?? card?.id ?? '—';
  const phase = card?.card_data?.phase ?? 'active';
  const total = cards.length;
  const phaseTone = phase === 'done' ? 'board-tone--done' : 'board-tone--active';

  return (
    <div className="board-ingest-nav">
      <div className="min-w-0 flex-grow-1">
        <div className="board-ingest-nav__title text-truncate">{title}</div>
      </div>
      <span className={`board-phase-pill ${phaseTone}`}>
        {phase}
      </span>
      <button
        type="button"
        className="board-icon-button"
        onClick={onPrev}
        disabled={idx === 0 || total === 0}
        aria-label="Previous card"
      >
        <i className="bi bi-chevron-up" />
      </button>
      <span className="board-ingest-nav__counter">{total > 0 ? `${idx + 1} / ${total}` : '—'}</span>
      <button
        type="button"
        className="board-icon-button"
        onClick={onNext}
        disabled={total === 0 || idx >= total - 1}
        aria-label="Next card"
      >
        <i className="bi bi-chevron-down" />
      </button>
    </div>
  );
}

function TruthsetExploreEmptyState() {
  return (
    <div className="board-ingest-card h-100 d-flex align-items-center justify-content-center p-4">
      <div className="text-center text-muted small">No Truthset cards found.</div>
    </div>
  );
}

export function TruthsetExplorePane({ spec = {} }) {
  const { boardId, includeFilters = [], rendererRules = [] } = spec;
  const { cardIds, idx, activeCardId, cards, expanded, toggleExpanded, goPrev, goNext } = usePaneState(boardId, { includeFilters });

  return (
    <PanelVertical
      fabPosition="top-right"
      expanded={expanded}
      onToggle={toggleExpanded}
      ariaLabel="Truthset Explore pane"
      title={expanded ? 'Hide Truthset Explore pane' : 'Show Truthset Explore pane'}
      icon="bi-chevron-left"
      iconToggled="bi-chevron-right"
    >
      <div className="board-ingest-pane__header">
        <div>
          <div className="board-ingest-pane__eyebrow">Truthset Explore</div>
        </div>
        <span className="board-ingest-pane__count">{`${cardIds.length} cards`}</span>
      </div>
      <TruthsetExploreNav
        cards={cards}
        idx={idx}
        onPrev={goPrev}
        onNext={goNext}
      />
      <div className="board-ingest-pane__body flex-grow-1 min-h-0">
        {activeCardId ? <CardRenderer boardId={boardId} cardId={activeCardId} rendererRules={rendererRules} chrome="bare" /> : <TruthsetExploreEmptyState />}
      </div>
    </PanelVertical>
  );
}