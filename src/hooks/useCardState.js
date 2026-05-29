import { useMemo } from 'react';
import { dispatchAction, refreshCard, patchCard, uploadFileForChat } from '../lib/client.js';
import {
  resolveCanRefresh,
  resolveRequireTokens,
  useBoardDataObjects,
  useBoardInfo,
  useCardDefinitionAndData,
  useCardRuntimeState,
} from './useSseSlices.js';

const EMPTY_FILES = Object.freeze([]);

export function useCardStateFilesData(boardId, cardId) {
  const definitionAndData = useCardDefinitionAndData(boardId, cardId);
  const files = definitionAndData?.cardData?.files;
  return Array.isArray(files) ? files : EMPTY_FILES;
}

export function useCardState(boardId, cardId) {
  const boardInfo = useBoardInfo(boardId);
  const dataObjects = useBoardDataObjects(boardId);
  const definitionAndData = useCardDefinitionAndData(boardId, cardId);
  const runtimeState = useCardRuntimeState(boardId, cardId);

  if (!definitionAndData || !cardId) return null;

  const cardContent = definitionAndData.cardContent;
  const cardData = definitionAndData.cardData;
  const cardRuntime = runtimeState?.cardRuntime ?? null;
  const canRefresh = resolveCanRefresh(cardContent);

  const requiresDataObjects = useMemo(() => {
    const next = {};
    for (const token of resolveRequireTokens(cardContent)) {
      if (token in dataObjects) {
        next[token] = dataObjects[token];
      }
    }
    return next;
  }, [cardContent, dataObjects]);

  const cardActions = useMemo(() => ({
    refresh: () => (canRefresh ? refreshCard(boardId, cardId) : Promise.resolve(null)),
    patch: (patch) => patchCard(boardId, cardId, patch),
    dispatchAction: (type, payload = {}) => dispatchAction(boardId, cardId, type, payload),
    uploadFileForChat: (file) => uploadFileForChat(boardId, cardId, file),
  }), [boardId, canRefresh, cardId]);

  return {
    boardSseClientId: boardInfo?.sseClientId ?? null,
    cardContent,
    canRefresh,
    cardData,
    cardRuntime,
    requiresDataObjects,
    cardActions,
  };
}
