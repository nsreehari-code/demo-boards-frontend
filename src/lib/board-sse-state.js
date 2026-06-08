import { runtimeNotificationsFromPayload } from 'yaml-flow/notification-consumer';
import { applyNotification as applyBoardNotification } from 'yaml-flow/board-state-reducer';

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
    cardWatchParties: EMPTY_OBJECT,
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

function buildState(payload, prev = null) {
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
    cardWatchParties: prev?.cardWatchParties ?? EMPTY_OBJECT,
  };
}

function buildReducerModel(snapshot, cardId) {
  const definitionAndData = snapshot?.cardDefinitionsAndData?.[cardId] ?? null;
  const statusEntry = snapshot?.boardStatus?.cardRuntimesById?.[cardId] ?? null;
  const computedValues = snapshot?.boardCardComputedValues?.[cardId] ?? EMPTY_OBJECT;
  const cardContent = definitionAndData?.cardContent ?? null;
  const requires = {};
  for (const token of normalizeBootstrapTokens(cardContent?.requires)) {
    requires[token] = Object.prototype.hasOwnProperty.call(snapshot?.boardDataObjects ?? EMPTY_OBJECT, token)
      ? snapshot.boardDataObjects[token]
      : null;
  }
  return {
    id: cardId,
    card: cardContent,
    card_data: definitionAndData?.cardData ?? EMPTY_OBJECT,
    requires,
    computed_values: computedValues,
    runtime_state: {
      task_status: statusEntry?.status ?? null,
      runtime: statusEntry?.runtime ?? EMPTY_OBJECT,
    },
    card_chats: snapshot?.cardChatViews?.[cardId]?.chatState ?? null,
  };
}

function buildReducerState(snapshot) {
  const cardIds = Object.keys(snapshot?.cardDefinitionsAndData ?? EMPTY_OBJECT);
  const modelsById = Object.fromEntries(cardIds.map((cardId) => [cardId, buildReducerModel(snapshot, cardId)]));
  return {
    payload: snapshot,
    cardIds,
    modelsById,
    cardWatchParties: snapshot?.cardWatchParties ?? EMPTY_OBJECT,
  };
}

function projectSnapshotFromReducer(base, reducerState, boardDataObjects, boardStatusSummary) {
  const cardDefinitionsAndData = {};
  const boardCardComputedValues = {};
  const cardChatViews = {};
  const cardRuntimesById = {};

  for (const cardId of reducerState.cardIds) {
    const model = reducerState.modelsById[cardId];
    if (!model) continue;

    const previousDefinitionAndData = base?.cardDefinitionsAndData?.[cardId] ?? null;
    const nextCardContent = model.card ?? previousDefinitionAndData?.cardContent ?? null;
    const nextCardData = model.card_data ?? EMPTY_OBJECT;
    cardDefinitionsAndData[cardId] = previousDefinitionAndData
      && previousDefinitionAndData.cardContent === nextCardContent
      && previousDefinitionAndData.cardData === nextCardData
      ? previousDefinitionAndData
      : { cardContent: nextCardContent, cardData: nextCardData };

    const previousComputedValues = base?.boardCardComputedValues?.[cardId] ?? EMPTY_OBJECT;
    const nextComputedValues = model.computed_values ?? EMPTY_OBJECT;
    boardCardComputedValues[cardId] = previousComputedValues === nextComputedValues
      ? previousComputedValues
      : nextComputedValues;

    const previousChatView = base?.cardChatViews?.[cardId] ?? null;
    const nextChatState = model.card_chats ?? createChatState();
    cardChatViews[cardId] = previousChatView && previousChatView.chatState === nextChatState
      ? previousChatView
      : createCardChatView({ chatState: nextChatState });

    const previousRuntime = base?.boardStatus?.cardRuntimesById?.[cardId] ?? { status: '', runtime: EMPTY_OBJECT };
    const nextRuntime = model.runtime_state?.runtime ?? previousRuntime.runtime;
    const nextStatus = model.runtime_state?.task_status ?? previousRuntime.status;
    cardRuntimesById[cardId] = previousRuntime.status === nextStatus && previousRuntime.runtime === nextRuntime
      ? previousRuntime
      : { status: nextStatus, runtime: nextRuntime };
  }

  return {
    ...base,
    boardStatus: {
      summary: boardStatusSummary,
      cardRuntimesById,
    },
    boardDataObjects,
    boardCardComputedValues,
    cardDefinitionsAndData,
    cardChatViews,
    cardWatchParties: reducerState.cardWatchParties ?? EMPTY_OBJECT,
  };
}

export function applyBoardSseFrame(prev, payload) {
  if (Array.isArray(payload?.cardDefinitions)) {
    return buildState(payload, prev);
  }

  const notifications = runtimeNotificationsFromPayload(payload);
  if (notifications.length === 0) {
    return prev;
  }

  const base = prev ?? createEmptyBoardSnapshot();
  let boardDataObjects = base.boardDataObjects ?? EMPTY_OBJECT;
  let boardStatusSummary = base.boardStatus?.summary ?? null;
  const reducerNotifications = [];

  for (const notification of notifications) {
    if (notification.kind === 'data_object' && notification.key) {
      if (boardDataObjects === (prev?.boardDataObjects ?? EMPTY_OBJECT)) {
        boardDataObjects = { ...boardDataObjects };
      }
      boardDataObjects[notification.key] = notification.payload;
    } else if (notification.kind === 'status' && notification.status && 'summary' in notification.status) {
      boardStatusSummary = notification.status.summary ?? null;
    }

    reducerNotifications.push(notification);
  }

  const reducerState = buildReducerState(base);
  const nextReducerState = reducerNotifications.length > 0
    ? applyBoardNotification(
      reducerState,
      reducerNotifications,
      (snapshotLikePayload, cardId) => buildReducerModel(snapshotLikePayload, cardId),
      () => base,
    )
    : reducerState;

  const nextSnapshot = projectSnapshotFromReducer(
    base,
    nextReducerState,
    boardDataObjects,
    boardStatusSummary,
  );

  const anyChanged = nextSnapshot.boardStatus !== base.boardStatus
    || nextSnapshot.boardDataObjects !== base.boardDataObjects
    || nextSnapshot.boardCardComputedValues !== base.boardCardComputedValues
    || nextSnapshot.cardDefinitionsAndData !== base.cardDefinitionsAndData
    || nextSnapshot.cardChatViews !== base.cardChatViews
    || nextSnapshot.cardWatchParties !== base.cardWatchParties;

  if (!anyChanged && prev) {
    return prev;
  }

  return nextSnapshot;
}