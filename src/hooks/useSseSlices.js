import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { fetchBoardOneShotPayload, openBoardSse, refreshCard } from '../lib/client.js';
import { AGENT_OUTPUT_CHANNEL, AGENT_TOOLS_CHANNEL } from '../lib/appConfig.js';
import {
  applyBoardSseFrame,
  createEmptyBoardSnapshot,
  EMPTY_ARRAY,
  EMPTY_OBJECT,
} from '../lib/board-sse-state.js';

const boardStores = new Map();
const boardUiStores = new Map();
const BOARD_RUNTIME_INIT_STATUS_EVENT = 'demo-board:runtime-init-status';

function publishBoardRuntimeInitStatus(boardId, status, error = null) {
  window.dispatchEvent(new CustomEvent(BOARD_RUNTIME_INIT_STATUS_EVENT, {
    detail: {
      boardId,
      status,
      message: error instanceof Error
        ? error.message
        : typeof error === 'string' && error.trim()
          ? error
          : '',
    },
  }));
}

function emitBoardStore(store) {
  store.listeners.forEach((listener) => listener());
}

function emitBoardUiStore(store) {
  store.listeners.forEach((listener) => listener());
}

function startBoardStore(boardId, store) {
  if (store.started) return;
  store.started = true;

  try {
    const clientId = crypto.randomUUID();
    store.clientId = clientId;
    const es = openBoardSse(boardId, clientId);
    store.es = es;

    void fetchBoardOneShotPayload(boardId).then((payload) => {
      if (!store.started) return;
      store.snapshot = applyBoardSseFrame(store.snapshot ?? createEmptyBoardSnapshot(boardId), payload);
      emitBoardStore(store);
    }).catch((err) => {
      console.debug('[useBoardSSE] one-shot bootstrap failed', err);
    });

    es.onopen = () => {
      if (!store.started) return;
      publishBoardRuntimeInitStatus(boardId, 'success');
    };

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        store.snapshot = applyBoardSseFrame(store.snapshot ?? createEmptyBoardSnapshot(boardId), payload);
        emitBoardStore(store);
      } catch {
        // ignore malformed frames
      }
    };

    es.onerror = () => {
      // EventSource reconnects automatically.
      console.debug('[useBoardSSE] SSE error — will retry');
    };
  } catch (err) {
    publishBoardRuntimeInitStatus(boardId, 'error', err);
    console.error('[useBoardSSE] SSE bootstrap failed', err);
  }
}

function getOrCreateBoardStore(boardId) {
  if (!boardStores.has(boardId)) {
    boardStores.set(boardId, {
      snapshot: null,
      clientId: null,
      listeners: new Set(),
      es: null,
      started: false,
      boardInfoCache: null,
      cardDefinitionAndDataCache: new Map(),
      cardRuntimeStateCache: new Map(),
      cardChatViewCache: new Map(),
      cardChatWatchPartyCache: new Map(),
    });
  }

  return boardStores.get(boardId);
}

function getOrCreateBoardUiStore(boardId) {
  if (!boardUiStores.has(boardId)) {
    boardUiStores.set(boardId, {
      snapshot: {
        inspectedCardId: null,
      },
      listeners: new Set(),
    });
  }

  return boardUiStores.get(boardId);
}

function subscribeBoardStore(boardId, listener) {
  if (!boardId) return () => {};

  const store = getOrCreateBoardStore(boardId);
  store.listeners.add(listener);
  startBoardStore(boardId, store);

  return () => {
    store.listeners.delete(listener);
  };
}

function subscribeBoardUiStore(boardId, listener) {
  if (!boardId) return () => {};

  const store = getOrCreateBoardUiStore(boardId);
  store.listeners.add(listener);

  return () => {
    store.listeners.delete(listener);
  };
}

function setBoardInspectedCardId(boardId, nextValue) {
  if (!boardId) return;

  const store = getOrCreateBoardUiStore(boardId);
  const currentValue = store.snapshot?.inspectedCardId ?? null;
  const resolvedValue = typeof nextValue === 'function'
    ? nextValue(currentValue)
    : nextValue;
  const inspectedCardId = resolvedValue ? String(resolvedValue) : null;

  if (currentValue === inspectedCardId) {
    return;
  }

  store.snapshot = {
    ...store.snapshot,
    inspectedCardId,
  };
  emitBoardUiStore(store);
}

function getBoardRawSnapshot(boardId) {
  return boardId ? getOrCreateBoardStore(boardId).snapshot : null;
}

function useBoardRaw(boardId) {
  const subscribe = useCallback((listener) => subscribeBoardStore(boardId, listener), [boardId]);
  const getSnapshot = useCallback(() => getBoardRawSnapshot(boardId), [boardId]);

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => null,
  );
}

function getBoardInfoSnapshot(boardId) {
  if (!boardId) return null;

  const store = getOrCreateBoardStore(boardId);
  const raw = store.snapshot;
  if (!raw) return null;

  const previousValue = store.boardInfoCache;
  const nextBoardId = raw.boardInfo?.boardId ?? boardId;
  const nextBoardInfo = raw.boardInfo?.boardInfo ?? null;
  const nextClientId = store.clientId ?? null;

  if (
    previousValue
    && previousValue.boardId === nextBoardId
    && previousValue.sseClientId === nextClientId
    && previousValue.boardInfo === nextBoardInfo
  ) {
    return previousValue;
  }

  const nextValue = {
    boardId: nextBoardId,
    sseClientId: nextClientId,
    boardInfo: nextBoardInfo,
  };
  store.boardInfoCache = nextValue;
  return nextValue;
}

function getCardDefinitionAndDataSnapshot(boardId, cardId) {
  if (!boardId || !cardId) return null;

  const store = getOrCreateBoardStore(boardId);
  const raw = store.snapshot;
  if (!raw) return null;

  const previousValue = store.cardDefinitionAndDataCache.get(cardId) ?? null;
  const definitionAndData = raw.cardDefinitionsAndData?.[cardId] ?? null;
  const cardContent = definitionAndData?.cardContent ?? null;
  const cardData = definitionAndData?.cardData ?? EMPTY_OBJECT;

  if (
    previousValue
    && previousValue.cardContent === cardContent
    && previousValue.cardData === cardData
  ) {
    return previousValue;
  }

  const nextValue = {
    cardContent,
    cardData,
  };
  store.cardDefinitionAndDataCache.set(cardId, nextValue);
  return nextValue;
}

function getCardRuntimeStateSnapshot(boardId, cardId) {
  if (!boardId || !cardId) return null;

  const store = getOrCreateBoardStore(boardId);
  const raw = store.snapshot;
  if (!raw) return null;

  const previousValue = store.cardRuntimeStateCache.get(cardId) ?? null;
  const statusEntry = raw.boardStatus?.cardRuntimesById?.[cardId] ?? null;
  const computedValues = raw.boardCardComputedValues?.[cardId] ?? EMPTY_OBJECT;

  if (
    previousValue
    && previousValue.statusEntry === statusEntry
    && previousValue.computedValues === computedValues
  ) {
    return previousValue;
  }

  const nextValue = {
    statusEntry,
    computedValues,
    cardRuntime: statusEntry
      ? {
        ...statusEntry,
        computed_values: computedValues,
      }
      : null,
  };
  store.cardRuntimeStateCache.set(cardId, nextValue);
  return nextValue;
}

function getCardChatViewsSnapshot(boardId, cardId) {
  if (!boardId || !cardId) return null;

  const store = getOrCreateBoardStore(boardId);
  const raw = store.snapshot;
  if (!raw) return null;

  const previousValue = store.cardChatViewCache.get(cardId) ?? null;
  const chatView = raw.cardChatViews?.[cardId] ?? null;
  const chatState = chatView?.chatState ?? null;

  if (previousValue && previousValue.chatState === chatState) {
    return previousValue;
  }

  const nextValue = { chatState };
  store.cardChatViewCache.set(cardId, nextValue);
  return nextValue;
}

function getCardChatWatchPartySnapshot(boardId, cardId) {
  if (!boardId || !cardId) return null;

  const store = getOrCreateBoardStore(boardId);
  const raw = store.snapshot;
  if (!raw) return null;

  const previousValue = store.cardChatWatchPartyCache.get(cardId) ?? null;
  const watchpartyState = raw.cardChatWatchParties?.[cardId] ?? EMPTY_OBJECT;
  const agentOutputEvents = Array.isArray(watchpartyState[AGENT_OUTPUT_CHANNEL])
    ? watchpartyState[AGENT_OUTPUT_CHANNEL]
    : EMPTY_ARRAY;
  const agentToolsEvents = Array.isArray(watchpartyState[AGENT_TOOLS_CHANNEL])
    ? watchpartyState[AGENT_TOOLS_CHANNEL]
    : EMPTY_ARRAY;
  const agentOutputEvent = agentOutputEvents.at(-1) ?? null;
  const agentToolsEvent = agentToolsEvents.at(-1) ?? null;
  const agentOutput = String(agentOutputEvent?.payload?.text ?? '');
  const agentTools = String(agentToolsEvent?.payload?.text ?? '');

  if (
    previousValue
    && previousValue.agentOutputEvent === agentOutputEvent
    && previousValue.agentToolsEvent === agentToolsEvent
    && previousValue.agentOutput === agentOutput
    && previousValue.agentTools === agentTools
  ) {
    return previousValue;
  }

  const nextValue = {
    agentOutput,
    agentOutputEvent,
    agentTools,
    agentToolsEvent,
  };
  store.cardChatWatchPartyCache.set(cardId, nextValue);
  return nextValue;
}

function normalizeFilterFns(filterFns) {
  if (!filterFns) return [];
  return (Array.isArray(filterFns) ? filterFns : [filterFns]).filter((filterFn) => typeof filterFn === 'function');
}

export function resolveRequireTokens(cardContent) {
  if (Array.isArray(cardContent?.requires)) {
    return cardContent.requires.filter(Boolean).map(String);
  }
  if (cardContent?.requires && typeof cardContent.requires === 'object') {
    return Object.keys(cardContent.requires).filter(Boolean);
  }
  return [];
}

export function resolveCanRefresh(cardContent) {
  return (cardContent?.source_defs?.length ?? 0) > 0;
}

export function buildBoardCardState(cardId, cardContents, cardRuntimes, dataObjects) {
  const cardContent = cardContents[cardId] ?? null;
  const requiresDataObjects = {};
  for (const token of resolveRequireTokens(cardContent)) {
    if (token in dataObjects) {
      requiresDataObjects[token] = dataObjects[token];
    }
  }

  return {
    cardId,
    cardContent,
    canRefresh: resolveCanRefresh(cardContent),
    cardData: cardContent?.card_data ?? EMPTY_OBJECT,
    cardRuntime: cardRuntimes[cardId] ?? null,
    requiresDataObjects,
  };
}

export function useBoardInfo(boardId) {
  const subscribe = useCallback((listener) => subscribeBoardStore(boardId, listener), [boardId]);
  const getSnapshot = useCallback(() => getBoardInfoSnapshot(boardId), [boardId]);

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => null,
  );
}

export function useBoardStatus(boardId) {
  const raw = useBoardRaw(boardId);
  return raw?.boardStatus?.summary ?? null;
}

export function useBoardDataObjects(boardId) {
  const raw = useBoardRaw(boardId);
  return raw?.boardDataObjects ?? EMPTY_OBJECT;
}

export function useBoardCardComputedValues(boardId) {
  const raw = useBoardRaw(boardId);
  return raw?.boardCardComputedValues ?? EMPTY_OBJECT;
}

export function useBoardCardDefinitionsAndData(boardId) {
  const raw = useBoardRaw(boardId);
  const cardDefinitionsAndData = raw?.cardDefinitionsAndData ?? EMPTY_OBJECT;

  return useMemo(() => Object.fromEntries(
    Object.entries(cardDefinitionsAndData).map(([cardId, definitionAndData]) => [cardId, definitionAndData?.cardContent ?? null]),
  ), [cardDefinitionsAndData]);
}

export function useBoardCardRuntimes(boardId) {
  const raw = useBoardRaw(boardId);
  const cardRuntimesById = raw?.boardStatus?.cardRuntimesById ?? EMPTY_OBJECT;
  const computedValuesById = raw?.boardCardComputedValues ?? EMPTY_OBJECT;

  return useMemo(() => {
    return Object.fromEntries(
      Object.entries(cardRuntimesById).map(([cardId, runtimeState]) => [cardId, {
        ...(runtimeState ?? EMPTY_OBJECT),
        computed_values: computedValuesById[cardId] ?? EMPTY_OBJECT,
      }]),
    );
  }, [cardRuntimesById, computedValuesById]);
}

export function useBoardCardIds(boardId) {
  const raw = useBoardRaw(boardId);
  const cardDefinitionsAndData = raw?.cardDefinitionsAndData ?? EMPTY_OBJECT;

  return useMemo(
    () => Object.keys(cardDefinitionsAndData),
    [cardDefinitionsAndData],
  );
}

export function useCardDefinitionAndData(boardId, cardId) {
  const subscribe = useCallback((listener) => subscribeBoardStore(boardId, listener), [boardId]);
  const getSnapshot = useCallback(() => getCardDefinitionAndDataSnapshot(boardId, cardId), [boardId, cardId]);

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => null,
  );
}

export function useCardRuntimeState(boardId, cardId) {
  const subscribe = useCallback((listener) => subscribeBoardStore(boardId, listener), [boardId]);
  const getSnapshot = useCallback(() => getCardRuntimeStateSnapshot(boardId, cardId), [boardId, cardId]);

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => null,
  );
}

export function useCardChatViews(boardId, cardId) {
  const subscribe = useCallback((listener) => subscribeBoardStore(boardId, listener), [boardId]);
  const getSnapshot = useCallback(() => getCardChatViewsSnapshot(boardId, cardId), [boardId, cardId]);

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => null,
  );
}

function getCardChatProcessingSnapshot(boardId, cardId) {
  if (!boardId || !cardId) return false;
  const store = getOrCreateBoardStore(boardId);
  const raw = store.snapshot;
  if (!raw) return false;
  return raw.cardChatViews?.[cardId]?.chatState?.processing === true;
}

export function useCardChatProcessing(boardId, cardId) {
  const subscribe = useCallback((listener) => subscribeBoardStore(boardId, listener), [boardId]);
  const getSnapshot = useCallback(() => getCardChatProcessingSnapshot(boardId, cardId), [boardId, cardId]);

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => false,
  );
}

export function useCardChatWatchParty(boardId, cardId) {
  const subscribe = useCallback((listener) => subscribeBoardStore(boardId, listener), [boardId]);
  const getSnapshot = useCallback(() => getCardChatWatchPartySnapshot(boardId, cardId), [boardId, cardId]);

  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => null,
  );
}

export function useBoardInspectState(boardId) {
  const subscribe = useCallback((listener) => subscribeBoardUiStore(boardId, listener), [boardId]);
  const getSnapshot = useCallback(
    () => (boardId ? getOrCreateBoardUiStore(boardId).snapshot : { inspectedCardId: null }),
    [boardId],
  );

  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => ({ inspectedCardId: null }),
  );

  const setInspectedCardId = useCallback((nextValue) => {
    setBoardInspectedCardId(boardId, nextValue);
  }, [boardId]);

  return {
    inspectedCardId: snapshot?.inspectedCardId ?? null,
    setInspectedCardId,
  };
}

export function useBoardFlipState(boardId) {
  const { inspectedCardId, setInspectedCardId } = useBoardInspectState(boardId);

  return {
    flippedCardId: inspectedCardId,
    setFlippedCardId: setInspectedCardId,
  };
}

export {
  EMPTY_ARRAY,
  EMPTY_OBJECT,
  normalizeFilterFns,
  refreshCard,
};