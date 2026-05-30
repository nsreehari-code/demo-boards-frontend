import { useCallback, useMemo } from 'react';
import { initBoard } from '../lib/client.js';
import {
  buildBoardCardState,
  normalizeFilterFns,
  refreshCard,
  resolveCanRefresh,
  resolveRequireTokens,
  useBoardCardDefinitionsAndData,
  useBoardCardIds,
  useBoardCardRuntimes,
  useBoardDataObjects,
  useBoardFlipState,
  useBoardInfo,
  useBoardStatus,
} from './useSseSlices.js';

export { resolveCanRefresh, resolveRequireTokens, useBoardFlipState };

export function useBoardState(boardId) {
  const boardInfo = useBoardInfo(boardId);
  const boardStatus = useBoardStatus(boardId);
  const dataObjects = useBoardDataObjects(boardId);
  const cardContents = useBoardCardDefinitionsAndData(boardId);
  const cardRuntimes = useBoardCardRuntimes(boardId);
  const cardIds = useBoardCardIds(boardId);

  const refreshableCardIds = useMemo(() => {
    const next = [];
    for (const cardId of cardIds) {
      if (resolveCanRefresh(cardContents[cardId])) {
        next.push(cardId);
      }
    }
    return next;
  }, [cardIds, cardContents]);

  const filterCards = useCallback((filterFns = []) => {
    const filters = normalizeFilterFns(filterFns);
    const matchedCardIds = new Set();
    for (const cardId of cardIds) {
      const cardState = buildBoardCardState(cardId, cardContents, cardRuntimes, dataObjects);
      if (filters.some((filterFn) => filterFn(cardState))) {
        matchedCardIds.add(cardId);
      }
    }
    return matchedCardIds;
  }, [cardIds, cardContents, cardRuntimes, dataObjects]);

  const excludedCards = useCallback((filterFns = []) => {
    const matchedCardIds = filterCards(filterFns);
    const remainingCardIds = new Set();
    for (const cardId of cardIds) {
      if (!matchedCardIds.has(cardId)) {
        remainingCardIds.add(cardId);
      }
    }
    return remainingCardIds;
  }, [cardIds, filterCards]);

  const boardActions = useMemo(() => ({
    initBoard: () => initBoard(boardId),
    refreshAll: () => Promise.allSettled(
      refreshableCardIds.map((cardId) => refreshCard(boardId, cardId)),
    ),
  }), [boardId, refreshableCardIds]);

  const board = useMemo(() => {
    if (!boardInfo) return null;
    return {
      boardId: boardInfo.boardId,
      sseClientId: boardInfo.sseClientId,
      boardInfo: boardInfo.boardInfo,
      cardContents,
      cardRuntimes,
      boardStatus,
      dataObjects,
      refreshableCardIds,
      hasRefreshableCards: refreshableCardIds.length > 0,
      filterCards,
      excludedCards,
      boardActions,
    };
  }, [
    boardInfo,
    cardContents,
    cardRuntimes,
    boardStatus,
    dataObjects,
    refreshableCardIds,
    filterCards,
    excludedCards,
    boardActions,
  ]);

  return board;
}


