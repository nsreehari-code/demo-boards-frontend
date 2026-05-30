import React, { useMemo, useState } from 'react';
import { useBoardState } from '../hooks/useBoardState.js';
import { CardShell } from './CardShell.jsx';

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

export function TruthsetExplorePane({ boardId, includeFilters = [], layoutStrategy = 'vertical' }) {
  const board = useBoardState(boardId);
  const [visible, setVisible] = useState(false);
  const [idx, setIdx] = useState(0);
  const layout = resolveLayoutStrategy(layoutStrategy);
  const truthsetCardIds = useMemo(() => {
    if (!board) return [];
    return [...board.filterCards(includeFilters)];
  }, [board, includeFilters]);

  const safeIdx = Math.min(idx, Math.max(0, truthsetCardIds.length - 1));
  const cardId = truthsetCardIds[safeIdx] ?? null;
  const cards = useMemo(() => {
    if (!board || !visible) return [];
    return truthsetCardIds.map((currentCardId) => {
      const cardContent = board.cardContents[currentCardId] ?? null;
      return {
        id: currentCardId,
        meta: cardContent?.meta ?? {},
        card_data: cardContent?.card_data ?? {},
      };
    });
  }, [board, truthsetCardIds]);

  if (!board) return null;

  return (
    <aside
      aria-label="Truthset Explore pane"
      className={`board-ingest-layer board-ingest-layer--right${visible ? ' is-open' : ''}`}
      style={layout.asideStyle}
    >
      <button
        type="button"
        className={`board-ingest-toggle board-ingest-toggle--right d-inline-flex align-items-center justify-content-center${visible ? ' is-open' : ''}`}
        onClick={() => setVisible((current) => !current)}
        aria-pressed={visible}
        title={visible ? 'Hide Truthset Explore pane' : 'Show Truthset Explore pane'}
      >
        <i className={`bi ${visible ? 'bi-chevron-right' : 'bi-chevron-left'}`} />
      </button>

      {visible ? (
        <>
          <div className="board-ingest-backdrop board-ingest-backdrop--right" aria-hidden="true" />
          <div className="board-ingest-pane d-flex flex-column" style={layout.railStyle}>
            <div className="board-ingest-pane__header">
              <div>
                <div className="board-ingest-pane__eyebrow">Truthset Explore</div>
              </div>
              <span className="board-ingest-pane__count">{`${truthsetCardIds.length} cards`}</span>
            </div>
            <TruthsetExploreNav
              cards={cards}
              idx={safeIdx}
              onPrev={() => setIdx((current) => Math.max(0, current - 1))}
              onNext={() => setIdx((current) => Math.min(truthsetCardIds.length - 1, current + 1))}
            />
            <div className="board-ingest-pane__body flex-grow-1 min-h-0">
              {cardId ? <CardShell boardId={boardId} cardId={cardId} /> : <TruthsetExploreEmptyState />}
            </div>
          </div>
        </>
      ) : null}
    </aside>
  );
}