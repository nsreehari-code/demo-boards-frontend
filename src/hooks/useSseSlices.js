import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { SERVER, initBoard, refreshCard } from '../lib/client.js';
import { AGENT_OUTPUT_CHANNEL, AGENT_TOOLS_CHANNEL } from '../lib/appConfig.js';

const boardStores = new Map();
const boardUiStores = new Map();
const EMPTY_OBJECT = Object.freeze({});
const EMPTY_ARRAY = Object.freeze([]);

function createEmptyBoardSnapshot(boardId = null) {
  return {
    boardInfo: {
      boardId,
      boardInfo: null,
    },
    boardStatus: {
      summary: null,
      cardRuntimesById: EMPTY_OBJECT,
    },
    boardDataObjects: EMPTY_OBJECT,
    boardCardComputedValues: EMPTY_OBJECT,
    cardDefinitionsAndData: EMPTY_OBJECT,
    cardChatViews: EMPTY_OBJECT,
    cardChatWatchParties: EMPTY_OBJECT,
  };
}

function createChatState(chatSnapshot = null) {
  if (!chatSnapshot) {
    return {
      messages: EMPTY_ARRAY,
      processing: false,
      receiving: false,
    };
  }

  return {
    messages: chatSnapshot?.messages ?? EMPTY_ARRAY,
    processing: !!chatSnapshot?.processing,
    receiving: !!chatSnapshot?.receiving,
  };
}

function createCardChatView({ chatState = null } = {}) {
  return {
    chatState: chatState ?? createChatState(),
  };
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

  initBoard(boardId)
    .then(() => {
      if (!store.started) return;

      const clientId = crypto.randomUUID();
      store.clientId = clientId;
      const url = `${SERVER}/api/boards/${boardId}/sse?clientId=${encodeURIComponent(clientId)}`;
      const es = new EventSource(url);
      store.es = es;

      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          store.snapshot = applyFrame(store.snapshot ?? createEmptyBoardSnapshot(boardId), payload);
          emitBoardStore(store);
        } catch {
          // ignore malformed frames
        }
      };

      es.onerror = () => {
        // EventSource reconnects automatically.
        console.debug('[useBoardSSE] SSE error — will retry');
      };
    })
    .catch((err) => console.error('[useBoardSSE] init-board failed', err));
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
        flippedCardId: null,
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

function setBoardFlippedCardId(boardId, nextValue) {
  if (!boardId) return;

  const store = getOrCreateBoardUiStore(boardId);
  const currentValue = store.snapshot?.flippedCardId ?? null;
  const resolvedValue = typeof nextValue === 'function'
    ? nextValue(currentValue)
    : nextValue;
  const flippedCardId = resolvedValue ? String(resolvedValue) : null;

  if (currentValue === flippedCardId) {
    return;
  }

  store.snapshot = {
    ...store.snapshot,
    flippedCardId,
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

function buildBoardStatusSnapshot(cardDefinitions, statusSnapshot, runtimeById) {
  const statusByName = {};
  for (const entry of (statusSnapshot?.cards ?? [])) {
    statusByName[entry.name] = entry;
  }

  const cardRuntimesById = {};
  for (const def of cardDefinitions) {
    const statusInfo = statusByName[def.id] ?? {};
    cardRuntimesById[def.id] = {
      status: statusInfo.status ?? '',
      runtime: statusInfo.runtime ?? EMPTY_OBJECT,
    };
  }

  return {
    summary: statusSnapshot?.summary ?? null,
    cardRuntimesById,
  };
}

function buildComputedValuesSnapshot(cardDefinitions, runtimeById) {
  return Object.fromEntries(
    cardDefinitions.map((def) => [def.id, runtimeById?.[def.id]?.computed_values ?? EMPTY_OBJECT]),
  );
}

function buildCardDefinitionsAndDataSnapshot(cardDefinitions) {
  return Object.fromEntries(
    cardDefinitions.map((def) => [def.id, {
      cardContent: def,
      cardData: def?.card_data ?? EMPTY_OBJECT,
    }]),
  );
}

function buildCardChatViewsSnapshot(cardChatsByCardId, cardDefinitionsAndData) {
  const cardChatViews = {};
  const cardIds = new Set([
    ...Object.keys(cardDefinitionsAndData ?? EMPTY_OBJECT),
    ...Object.keys(cardChatsByCardId ?? EMPTY_OBJECT),
  ]);

  for (const cardId of cardIds) {
    const chatSnapshot = cardChatsByCardId?.[cardId] ?? null;
    cardChatViews[cardId] = createCardChatView({
      chatState: createChatState(chatSnapshot),
    });
  }

  return cardChatViews;
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

function buildState(payload) {
  const cardDefinitions = payload.cardDefinitions ?? EMPTY_ARRAY;
  const cardDefinitionsAndData = buildCardDefinitionsAndDataSnapshot(cardDefinitions);

  return {
    boardInfo: {
      boardId: payload.boardId ?? null,
      boardInfo: payload.boardInfo ?? null,
    },
    boardStatus: buildBoardStatusSnapshot(cardDefinitions, payload.statusSnapshot, payload.cardRuntimeById),
    boardDataObjects: payload.dataObjectsByToken ?? EMPTY_OBJECT,
    boardCardComputedValues: buildComputedValuesSnapshot(cardDefinitions, payload.cardRuntimeById),
    cardDefinitionsAndData,
    cardChatViews: buildCardChatViewsSnapshot(payload.cardChatsByCardId, cardDefinitionsAndData),
    cardChatWatchParties: EMPTY_OBJECT,
  };
}

function applyFrame(prev, payload) {
  if (Array.isArray(payload.cardDefinitions)) {
    return buildState(payload);
  }

  if (payload.kind !== 'notification-batch') {
    return prev;
  }

  const base = prev ?? createEmptyBoardSnapshot();
  let boardStatus = base.boardStatus;
  let cardRuntimesById = boardStatus.cardRuntimesById ?? EMPTY_OBJECT;
  let boardDataObjects = base.boardDataObjects ?? EMPTY_OBJECT;
  let boardCardComputedValues = base.boardCardComputedValues ?? EMPTY_OBJECT;
  let cardDefinitionsAndData = base.cardDefinitionsAndData ?? EMPTY_OBJECT;
  let cardChatViews = base.cardChatViews ?? EMPTY_OBJECT;
  let cardChatWatchParties = base.cardChatWatchParties ?? EMPTY_OBJECT;
  let boardStatusChanged = false;
  let cardRuntimesChanged = false;

  const ensureBoardStatus = () => {
    if (!boardStatusChanged) {
      boardStatus = { ...boardStatus };
      boardStatusChanged = true;
    }
  };
  const ensureCardRuntimes = () => {
    if (!cardRuntimesChanged) {
      cardRuntimesById = { ...cardRuntimesById };
      cardRuntimesChanged = true;
      ensureBoardStatus();
    }
  };

  for (const notification of (payload.notifications ?? [])) {
    if (notification.kind === 'status') {
      if (notification.status && 'summary' in notification.status) {
        ensureBoardStatus();
        boardStatus.summary = notification.status.summary ?? null;
      }
      const cards = notification.status?.cards ?? [];
      if (cards.length > 0) {
        ensureCardRuntimes();
        for (const entry of cards) {
          const previousStatus = cardRuntimesById[entry.name] ?? { status: '', runtime: EMPTY_OBJECT };
          cardRuntimesById[entry.name] = {
            ...previousStatus,
            status: entry.status,
            runtime: entry.runtime ?? previousStatus.runtime,
          };
        }
      }
    } else if (notification.kind === 'data_object' && notification.key) {
      if (boardDataObjects === (prev?.boardDataObjects ?? EMPTY_OBJECT)) {
        boardDataObjects = { ...boardDataObjects };
      }
      boardDataObjects[notification.key] = notification.payload;
    } else if (notification.kind === 'computed_values' && notification.cardId) {
      if (boardCardComputedValues === (prev?.boardCardComputedValues ?? EMPTY_OBJECT)) {
        boardCardComputedValues = { ...boardCardComputedValues };
      }
      boardCardComputedValues[notification.cardId] = notification.values ?? EMPTY_OBJECT;
    } else if (notification.kind === 'card_chats' && notification.cardId) {
      if (cardChatViews === (prev?.cardChatViews ?? EMPTY_OBJECT)) {
        cardChatViews = { ...cardChatViews };
      }
      cardChatViews[notification.cardId] = createCardChatView({
        chatState: createChatState(notification),
      });
    } else if (notification.kind === 'card_watchparty' && notification.cardId && notification.channel) {
      if (cardChatWatchParties === (prev?.cardChatWatchParties ?? EMPTY_OBJECT)) {
        cardChatWatchParties = { ...cardChatWatchParties };
      }
      const previousWatchParty = cardChatWatchParties[notification.cardId] ?? EMPTY_OBJECT;
      const nextWatchpartyByChannel = { ...previousWatchParty };
      if (notification.clear) {
        nextWatchpartyByChannel[notification.channel] = EMPTY_ARRAY;
      } else if (notification.replace) {
        nextWatchpartyByChannel[notification.channel] = [{ payload: notification.payload, ts: Date.now() }];
      } else {
        nextWatchpartyByChannel[notification.channel] = [
          ...(nextWatchpartyByChannel[notification.channel] ?? EMPTY_ARRAY),
          { payload: notification.payload, ts: Date.now() },
        ];
      }
      cardChatWatchParties[notification.cardId] = nextWatchpartyByChannel;
    } else if (notification.kind === 'card_refreshed' && notification.cardId && notification.card) {
      const { computed_values, runtime, status, ...cardContentPatch } = notification.card;
      if (cardDefinitionsAndData === (prev?.cardDefinitionsAndData ?? EMPTY_OBJECT)) {
        cardDefinitionsAndData = { ...cardDefinitionsAndData };
      }
      const previousDefinitionAndData = cardDefinitionsAndData[notification.cardId] ?? {
        cardContent: null,
        cardData: EMPTY_OBJECT,
      };
      const nextCardContent = previousDefinitionAndData.cardContent
        ? { ...previousDefinitionAndData.cardContent, ...cardContentPatch }
        : cardContentPatch;
      const nextCardData = nextCardContent?.card_data ?? EMPTY_OBJECT;
      cardDefinitionsAndData[notification.cardId] = {
        cardContent: nextCardContent,
        cardData: nextCardData,
      };

      if (status !== undefined || runtime !== undefined) {
        ensureCardRuntimes();
        const previousStatus = cardRuntimesById[notification.cardId] ?? { status: '', runtime: EMPTY_OBJECT };
        cardRuntimesById[notification.cardId] = {
          ...previousStatus,
          ...(status !== undefined ? { status } : null),
          ...(runtime !== undefined ? { runtime } : null),
        };
      }

      if (computed_values !== undefined) {
        if (boardCardComputedValues === (prev?.boardCardComputedValues ?? EMPTY_OBJECT)) {
          boardCardComputedValues = { ...boardCardComputedValues };
        }
        boardCardComputedValues[notification.cardId] = computed_values ?? EMPTY_OBJECT;
      }
    }
  }

  if (boardStatusChanged) {
    boardStatus.cardRuntimesById = cardRuntimesById;
  }

  const anyChanged = boardStatusChanged
    || boardDataObjects !== (prev?.boardDataObjects ?? EMPTY_OBJECT)
    || boardCardComputedValues !== (prev?.boardCardComputedValues ?? EMPTY_OBJECT)
    || cardDefinitionsAndData !== (prev?.cardDefinitionsAndData ?? EMPTY_OBJECT)
    || cardChatViews !== (prev?.cardChatViews ?? EMPTY_OBJECT)
    || cardChatWatchParties !== (prev?.cardChatWatchParties ?? EMPTY_OBJECT);

  if (!anyChanged && prev) return prev;

  return {
    ...base,
    boardStatus,
    boardDataObjects,
    boardCardComputedValues,
    cardDefinitionsAndData,
    cardChatViews,
    cardChatWatchParties,
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

export function useBoardFlipState(boardId) {
  const subscribe = useCallback((listener) => subscribeBoardUiStore(boardId, listener), [boardId]);
  const getSnapshot = useCallback(
    () => (boardId ? getOrCreateBoardUiStore(boardId).snapshot : { flippedCardId: null }),
    [boardId],
  );

  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => ({ flippedCardId: null }),
  );

  const setFlippedCardId = useCallback((nextValue) => {
    setBoardFlippedCardId(boardId, nextValue);
  }, [boardId]);

  return {
    flippedCardId: snapshot?.flippedCardId ?? null,
    setFlippedCardId,
  };
}

export {
  EMPTY_ARRAY,
  EMPTY_OBJECT,
  normalizeFilterFns,
  refreshCard,
};