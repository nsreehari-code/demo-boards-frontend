import { useCallback, useMemo, useState } from 'react';
import { useBoardState } from './useBoardState.js';

// Per-pane state hook. Owns the pane's *data slice* (the card ids matching the
// pane's filters, the active card, and the nav-ready card summaries) plus the
// pane's own *UI state* (the rail open/closed toggle and the carousel index).
//
// It deliberately knows nothing about "should this pane exist" — presence is a
// rendering consequence resolved by PaneRenderer (empty → not rendered), never a
// stored fact. `filterCards` is the presence-free matching primitive.
export function usePaneState(boardId, { includeFilters = [] } = {}) {
  const board = useBoardState(boardId);
  const [expanded, setExpanded] = useState(false);
  const [idx, setIdx] = useState(0);

  const cardIds = useMemo(() => {
    if (!board) return [];
    return [...board.filterCards(includeFilters)];
  }, [board, includeFilters]);

  const count = cardIds.length;
  const safeIdx = Math.min(idx, Math.max(0, count - 1));
  const activeCardId = cardIds[safeIdx] ?? null;

  // Only materialize the nav summaries while the rail is open.
  const cards = useMemo(() => {
    if (!board || !expanded) return [];
    return cardIds.map((cardId) => {
      const cardContent = board.cardContents[cardId] ?? null;
      return {
        id: cardId,
        meta: cardContent?.meta ?? {},
        card_data: cardContent?.card_data ?? {},
      };
    });
  }, [board, cardIds, expanded]);

  const toggleExpanded = useCallback(() => setExpanded((current) => !current), []);
  const goPrev = useCallback(() => setIdx((current) => Math.max(0, current - 1)), []);
  const goNext = useCallback(() => setIdx((current) => Math.min(count - 1, current + 1)), [count]);

  return {
    board,
    cardIds,
    count,
    idx: safeIdx,
    activeCardId,
    cards,
    expanded,
    toggleExpanded,
    goPrev,
    goNext,
  };
}
