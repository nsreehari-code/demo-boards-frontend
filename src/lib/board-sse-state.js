import {
  isBoardChangeNotification,
  isChatScopedRuntimeNotification,
  runtimeNotificationsFromPayload,
} from 'yaml-flow/notification-consumer';

export const EMPTY_OBJECT = Object.freeze({});
export const EMPTY_ARRAY = Object.freeze([]);

export function createEmptyBoardSnapshot(boardId = null) {
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

function normalizeBootstrapTokens(tokens) {
  return Array.isArray(tokens)
    ? tokens.filter(Boolean).map(String)
    : EMPTY_ARRAY;
}

function buildFallbackCardDefinitions(statusSnapshot, runtimeById) {
  const fallbackById = new Map();

  for (const entry of (statusSnapshot?.cards ?? [])) {
    const cardId = typeof entry?.name === 'string' ? entry.name.trim() : '';
    if (!cardId || fallbackById.has(cardId)) {
      continue;
    }

    fallbackById.set(cardId, {
      id: cardId,
      meta: { title: cardId },
      requires: normalizeBootstrapTokens(entry?.requires),
      provides: normalizeBootstrapTokens(entry?.provides_declared ?? entry?.provides_runtime),
      source_defs: EMPTY_ARRAY,
      card_data: EMPTY_OBJECT,
    });
  }

  for (const cardId of Object.keys(runtimeById ?? EMPTY_OBJECT)) {
    const normalizedId = typeof cardId === 'string' ? cardId.trim() : '';
    if (!normalizedId || fallbackById.has(normalizedId)) {
      continue;
    }

    fallbackById.set(normalizedId, {
      id: normalizedId,
      meta: { title: normalizedId },
      requires: EMPTY_ARRAY,
      provides: EMPTY_ARRAY,
      source_defs: EMPTY_ARRAY,
      card_data: EMPTY_OBJECT,
    });
  }

  return [...fallbackById.values()];
}

function buildBoardStatusSnapshot(cardDefinitions, statusSnapshot) {
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

function buildState(payload) {
  const cardDefinitions = Array.isArray(payload.cardDefinitions) && payload.cardDefinitions.length > 0
    ? payload.cardDefinitions
    : buildFallbackCardDefinitions(payload.statusSnapshot, payload.cardRuntimeById);
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

export function applyBoardSseFrame(prev, payload) {
  if (Array.isArray(payload?.cardDefinitions)) {
    return buildState(payload);
  }

  const notifications = runtimeNotificationsFromPayload(payload);
  if (notifications.length === 0) {
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

  for (const notification of notifications) {
    if (notification.kind === 'card_watchparty' && notification.cardId && notification.channel) {
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
      continue;
    }

    if (isChatScopedRuntimeNotification(notification)) {
      if (notification.kind === 'card_chats' && notification.cardId) {
        if (cardChatViews === (prev?.cardChatViews ?? EMPTY_OBJECT)) {
          cardChatViews = { ...cardChatViews };
        }
        cardChatViews[notification.cardId] = createCardChatView({
          chatState: createChatState(notification),
        });
      }
      continue;
    }

    if (!isBoardChangeNotification(notification)) {
      continue;
    }

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