import React from 'react';
import { usePaneState } from '../../../hooks/usePaneState.js';
import { CardRenderer } from '../../renderers/CardRenderer.jsx';

const TRUTHSET_PANE_LAYOUTS = {
  vertical: {
    asideStyle: {
      position: 'fixed',
      top: 'calc(var(--nav-height) + 0.5rem)',
      right: '12px',
      height: 'calc(100dvh - var(--nav-height) - 1rem)',
      zIndex: 1040,
      display: 'flex',
      alignItems: 'flex-start',
      pointerEvents: 'none',
    },
    railStyle: {
      pointerEvents: 'auto',
      width: 'min(30rem, calc(100vw - 4.5rem))',
      height: '100%',
      overflow: 'hidden',
    },
  },
};

function resolveLayoutStrategy(layoutStrategy) {
  if (!layoutStrategy) return TRUTHSET_PANE_LAYOUTS.vertical;
  if (typeof layoutStrategy === 'string') {
    return TRUTHSET_PANE_LAYOUTS[layoutStrategy] ?? TRUTHSET_PANE_LAYOUTS.vertical;
  }

  return {
    ...TRUTHSET_PANE_LAYOUTS.vertical,
    ...layoutStrategy,
  };
}

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
  const { boardId, includeFilters = [], layoutStrategy = 'vertical', rendererRules = [] } = spec;
  const layout = resolveLayoutStrategy(layoutStrategy);
  const { cardIds, idx, activeCardId, cards, expanded, toggleExpanded, goPrev, goNext } = usePaneState(boardId, { includeFilters });

  return (
    <aside
      aria-label="Truthset Explore pane"
      className={`board-ingest-layer board-ingest-layer--right${expanded ? ' is-open' : ''}`}
      style={layout.asideStyle}
    >
      <button
        type="button"
        className={`board-ingest-toggle board-ingest-toggle--right d-inline-flex align-items-center justify-content-center${expanded ? ' is-open' : ''}`}
        onClick={toggleExpanded}
        aria-pressed={expanded}
        title={expanded ? 'Hide Truthset Explore pane' : 'Show Truthset Explore pane'}
      >
        <i className={`bi ${expanded ? 'bi-chevron-right' : 'bi-chevron-left'}`} />
      </button>

      {expanded ? (
        <>
          <div className="board-ingest-backdrop board-ingest-backdrop--right" aria-hidden="true" />
          <div className="board-ingest-pane d-flex flex-column" style={layout.railStyle}>
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
          </div>
        </>
      ) : null}
    </aside>
  );
}