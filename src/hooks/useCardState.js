import { dispatchAction, refreshCard, patchCard, uploadFileForChat } from '../lib/client.js';
import { COPILOT_OUTPUT_CHANNEL, COPILOT_TOOLS_CHANNEL } from '../lib/appConfig.js';
import { resolveCanRefresh, resolveRequireTokens, useBoardState } from './useBoardState.js';

export function useCardState(boardId, cardId) {
  const board = useBoardState(boardId);

  if (!board || !cardId) return null;

  const cardContent = board.cardContents[cardId] ?? null;

  const requiresDataObjects = {};
  for (const token of resolveRequireTokens(cardContent)) {
    if (token in board.dataObjects) {
      requiresDataObjects[token] = board.dataObjects[token];
    }
  }

  const canRefresh = resolveCanRefresh(cardContent);

  const cardActions = {
    refresh: () => (canRefresh ? refreshCard(boardId, cardId) : Promise.resolve(null)),
    patch: (patch) => patchCard(boardId, cardId, patch),
    dispatchAction: (type, payload = {}) => dispatchAction(boardId, cardId, type, payload),
    uploadFileForChat: (file) => uploadFileForChat(boardId, cardId, file),
  };

  const cardData = cardContent?.card_data ?? {};
  const chatState = board.chatStates?.[cardId] ?? null;
  const watchpartyState = board.watchpartyById?.[cardId] ?? {};
  const copilotOutputEvents = Array.isArray(watchpartyState[COPILOT_OUTPUT_CHANNEL])
    ? watchpartyState[COPILOT_OUTPUT_CHANNEL]
    : [];
  const copilotToolsEvents = Array.isArray(watchpartyState[COPILOT_TOOLS_CHANNEL])
    ? watchpartyState[COPILOT_TOOLS_CHANNEL]
    : [];
  const copilotOutputEvent = copilotOutputEvents.at(-1) ?? null;
  const copilotToolsEvent = copilotToolsEvents.at(-1) ?? null;
  const copilotOutput = String(copilotOutputEvents.at(-1)?.payload?.text ?? '');
  const copilotTools = String(copilotToolsEvents.at(-1)?.payload?.text ?? '');
  const filesUploaded = cardData.files ?? [];
  const filesUploadedCount = filesUploaded.length;

  return {
    boardSseClientId: board.sseClientId ?? null,
    cardContent,
    canRefresh,
    cardData,
    cardRuntime: board.cardRuntimes[cardId] ?? null,
    chatState,
    copilotOutput,
    copilotOutputEvent,
    copilotTools,
    copilotToolsEvent,
    requiresDataObjects,
    filesUploaded,
    filesUploadedCount,
    cardActions,
  };
}
