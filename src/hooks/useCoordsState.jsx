import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BOARD_TRANSPORT_MODE, BOARD_TRANSPORT_MODE_SERVER_URL, SERVER } from '../lib/appConfig.js';
import { normalizeRuntimeCanvasLayout } from '../lib/boardCanvasLayout.js';
import { useManageBoards } from './useManageBoards.js';

const EMPTY_LAYOUT_STATE = Object.freeze({
  cardIds: [],
  positions: {},
  widths: {},
  viewport: null,
});

const BoardCoordsContext = createContext(null);

function cloneLayoutState(layoutState) {
  return {
    cardIds: Array.isArray(layoutState?.cardIds) ? [...layoutState.cardIds] : [],
    positions: layoutState?.positions && typeof layoutState.positions === 'object' ? { ...layoutState.positions } : {},
    widths: layoutState?.widths && typeof layoutState.widths === 'object' ? { ...layoutState.widths } : {},
    viewport: layoutState?.viewport ? { ...layoutState.viewport } : null,
  };
}

function normalizeLayoutState(layout) {
  const normalized = normalizeRuntimeCanvasLayout(layout?.canvas ?? layout);
  return normalized ? cloneLayoutState(normalized) : cloneLayoutState(EMPTY_LAYOUT_STATE);
}

function hasLayoutData(layoutState) {
  return Boolean(
    layoutState
    && (layoutState.cardIds?.length
      || Object.keys(layoutState.positions ?? {}).length
      || Object.keys(layoutState.widths ?? {}).length
      || layoutState.viewport),
  );
}

function ensureCardId(cardIds, cardId) {
  return cardIds.includes(cardId) ? cardIds : [...cardIds, cardId];
}

export function BoardCoordsProvider({ boardId, initialLayout = null, children }) {
  const { manageBoardsActions } = useManageBoards(SERVER, { enabled: false });
  const [layoutState, setLayoutState] = useState(() => normalizeLayoutState(initialLayout));
  const activeBoardIdRef = useRef(boardId);
  const layoutRef = useRef(layoutState);
  layoutRef.current = layoutState;

  useEffect(() => {
    const normalizedInitial = normalizeLayoutState(initialLayout);
    if (activeBoardIdRef.current !== boardId) {
      activeBoardIdRef.current = boardId;
      setLayoutState(normalizedInitial);
      return;
    }

    if (!hasLayoutData(layoutRef.current) && hasLayoutData(normalizedInitial)) {
      setLayoutState(normalizedInitial);
    }
  }, [boardId, initialLayout]);

  const setCoords = useCallback((cardId, nextCoords) => {
    if (!cardId) return;
    setLayoutState((currentState) => {
      const resolvedCoords = typeof nextCoords === 'function'
        ? nextCoords(currentState.positions?.[cardId] ?? null)
        : nextCoords;
      if (!resolvedCoords || !Number.isFinite(Number(resolvedCoords.x)) || !Number.isFinite(Number(resolvedCoords.y))) {
        return currentState;
      }
      const normalizedCoords = { x: Number(resolvedCoords.x), y: Number(resolvedCoords.y) };
      const currentCoords = currentState.positions?.[cardId] ?? null;
      if (currentCoords?.x === normalizedCoords.x && currentCoords?.y === normalizedCoords.y) {
        return currentState;
      }
      return {
        ...currentState,
        cardIds: ensureCardId(currentState.cardIds, cardId),
        positions: {
          ...currentState.positions,
          [cardId]: normalizedCoords,
        },
      };
    });
  }, []);

  const setManyCoords = useCallback((nextCoordsByCardId) => {
    if (!nextCoordsByCardId || typeof nextCoordsByCardId !== 'object' || Array.isArray(nextCoordsByCardId)) {
      return;
    }

    setLayoutState((currentState) => {
      let changed = false;
      const nextPositions = { ...currentState.positions };
      let nextCardIds = currentState.cardIds;

      for (const [cardId, coords] of Object.entries(nextCoordsByCardId)) {
        if (!cardId || !coords || !Number.isFinite(Number(coords.x)) || !Number.isFinite(Number(coords.y))) {
          continue;
        }
        const normalizedCoords = { x: Number(coords.x), y: Number(coords.y) };
        const currentCoords = nextPositions[cardId];
        if (currentCoords?.x === normalizedCoords.x && currentCoords?.y === normalizedCoords.y) {
          continue;
        }
        nextPositions[cardId] = normalizedCoords;
        nextCardIds = ensureCardId(nextCardIds, cardId);
        changed = true;
      }

      if (!changed) {
        return currentState;
      }

      return {
        ...currentState,
        cardIds: nextCardIds,
        positions: nextPositions,
      };
    });
  }, []);

  const setWidth = useCallback((cardId, nextWidth) => {
    if (!cardId) return;
    setLayoutState((currentState) => {
      const normalizedWidth = Number(nextWidth);
      const currentWidth = currentState.widths?.[cardId];
      if (!Number.isFinite(normalizedWidth) || normalizedWidth <= 0) {
        if (!Number.isFinite(currentWidth)) {
          return currentState;
        }
        const nextWidths = { ...currentState.widths };
        delete nextWidths[cardId];
        return {
          ...currentState,
          widths: nextWidths,
        };
      }
      if (currentWidth === normalizedWidth) {
        return currentState;
      }
      return {
        ...currentState,
        cardIds: ensureCardId(currentState.cardIds, cardId),
        widths: {
          ...currentState.widths,
          [cardId]: normalizedWidth,
        },
      };
    });
  }, []);

  const setViewport = useCallback((nextViewport) => {
    setLayoutState((currentState) => {
      if (!nextViewport || !Number.isFinite(Number(nextViewport.x)) || !Number.isFinite(Number(nextViewport.y)) || !Number.isFinite(Number(nextViewport.zoom))) {
        if (!currentState.viewport) {
          return currentState;
        }
        return {
          ...currentState,
          viewport: null,
        };
      }

      const normalizedViewport = {
        x: Number(nextViewport.x),
        y: Number(nextViewport.y),
        zoom: Number(nextViewport.zoom),
      };
      if (
        currentState.viewport?.x === normalizedViewport.x
        && currentState.viewport?.y === normalizedViewport.y
        && currentState.viewport?.zoom === normalizedViewport.zoom
      ) {
        return currentState;
      }

      return {
        ...currentState,
        viewport: normalizedViewport,
      };
    });
  }, []);

  const flushLayout = useCallback(async () => {
    if (!boardId || BOARD_TRANSPORT_MODE !== BOARD_TRANSPORT_MODE_SERVER_URL) {
      return;
    }
    await manageBoardsActions.saveLayout(boardId, {
      canvas: layoutRef.current,
    });
  }, [boardId, manageBoardsActions]);

  useEffect(() => {
    const handler = () => {
      void flushLayout();
    };
    window.addEventListener('demo-board:persist-canvas', handler);
    return () => {
      window.removeEventListener('demo-board:persist-canvas', handler);
      void flushLayout();
    };
  }, [flushLayout]);

  const value = useMemo(() => ({
    boardId,
    layoutState,
    setCoords,
    setManyCoords,
    setWidth,
    setViewport,
    flushLayout,
  }), [boardId, flushLayout, layoutState, setCoords, setManyCoords, setViewport, setWidth]);

  return (
    <BoardCoordsContext.Provider value={value}>
      {children}
    </BoardCoordsContext.Provider>
  );
}

function useBoardCoordsContext() {
  return useContext(BoardCoordsContext);
}

export function useBoardLayoutState() {
  return useBoardCoordsContext()?.layoutState ?? cloneLayoutState(EMPTY_LAYOUT_STATE);
}

export function useBoardLayoutActions() {
  const context = useBoardCoordsContext();
  return {
    setCoords: context?.setCoords ?? (() => {}),
    setManyCoords: context?.setManyCoords ?? (() => {}),
    setWidth: context?.setWidth ?? (() => {}),
    setViewport: context?.setViewport ?? (() => {}),
    flushLayout: context?.flushLayout ?? (async () => {}),
  };
}

export function useCoordsState(cardId) {
  const context = useBoardCoordsContext();
  const coords = context?.layoutState?.positions?.[cardId] ?? null;
  const setCoords = useCallback((nextCoords) => {
    context?.setCoords?.(cardId, nextCoords);
  }, [cardId, context]);
  return { coords, setCoords };
}

export function useCardWidthState(cardId) {
  const context = useBoardCoordsContext();
  const width = context?.layoutState?.widths?.[cardId] ?? null;
  const setWidth = useCallback((nextWidth) => {
    context?.setWidth?.(cardId, nextWidth);
  }, [cardId, context]);
  return [width, setWidth];
}