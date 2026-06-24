import React from 'react';
import { usePaneState } from '../../../hooks/usePaneState.js';
import { CardRenderer } from '../../renderers/CardRenderer.jsx';
import { PanelVertical } from '../../shared/PanelVertical.jsx';

function GandalfPaneNav({ cards, idx, onPrev, onNext }) {
  const card = cards[idx];
  const title = card?.meta?.title ?? card?.id ?? '—';
  const total = cards.length;

  return (
    <div className="board-ingest-nav">
      <div className="min-w-0 flex-grow-1">
        <div className="board-ingest-nav__title text-truncate">{title}</div>
      </div>
      <button
        type="button"
        className="board-icon-button"
        onClick={onPrev}
        disabled={idx === 0}
        aria-label="Previous card"
      >
        <i className="bi bi-chevron-up" />
      </button>
      <span className="board-ingest-nav__counter">{total > 0 ? `${idx + 1} / ${total}` : '—'}</span>
      <button
        type="button"
        className="board-icon-button"
        onClick={onNext}
        disabled={idx >= total - 1}
        aria-label="Next card"
      >
        <i className="bi bi-chevron-down" />
      </button>
    </div>
  );
}

export function GandalfPane({ spec = {} }) {
  const { boardId, includeFilters = [], rendererRules = [] } = spec;
  const { cardIds, idx, activeCardId, cards, expanded, toggleExpanded, goPrev, goNext } = usePaneState(boardId, { includeFilters });

  return (
    <PanelVertical
      fabPosition="top-left"
      expanded={expanded}
      onToggle={toggleExpanded}
      ariaLabel="Ingest pane"
      title={expanded ? 'Hide ingest pane' : 'Show ingest pane'}
      icon="bi-chevron-right"
      iconToggled="bi-chevron-left"
    >
      <div className="board-ingest-pane__header">
        <div>
          <div className="board-ingest-pane__eyebrow">Board Manager</div>
        </div>
        <span className="board-ingest-pane__count">{`${cardIds.length} cards`}</span>
      </div>
      <GandalfPaneNav
        cards={cards}
        idx={idx}
        onPrev={goPrev}
        onNext={goNext}
      />
      <div className="board-ingest-pane__body flex-grow-1 min-h-0">
        {activeCardId ? <CardRenderer boardId={boardId} cardId={activeCardId} rendererRules={rendererRules} chrome="bare" /> : null}
      </div>
    </PanelVertical>
  );
}
