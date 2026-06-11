import { useMemo } from 'react';
import { callBoardMcp, dispatchAction, refreshCard, patchCard, uploadFileForChat } from '../lib/client.js';
import {
  resolveCanRefresh,
  resolveRequireTokens,
  useBoardDataObjects,
  useBoardInfo,
  useCardDefinitionAndData,
  useCardRuntimeState,
} from './useSseSlices.js';

const EMPTY_FILES = Object.freeze([]);

function resolveProvideTokens(cardContent) {
  const provideDefs = Array.isArray(cardContent?.provides) ? cardContent.provides : EMPTY_FILES;
  const tokens = [];
  for (const entry of provideDefs) {
    if (typeof entry === 'string' && entry) {
      tokens.push(entry);
      continue;
    }
    if (entry && typeof entry === 'object' && typeof entry.bindTo === 'string' && entry.bindTo.trim()) {
      tokens.push(entry.bindTo.trim());
    }
  }
  return [...new Set(tokens)];
}

function readJsonResponse(response) {
  return response.json()
    .catch(() => null)
    .then((payload) => {
      if (!response.ok) {
        const message = typeof payload?.error === 'string'
          ? payload.error
          : `Request failed with status ${response.status}`;
        throw new Error(message);
      }
      return payload;
    });
}

function unwrapMcpToolPayload(payload) {
  if (payload && typeof payload === 'object' && payload.status === 'fail') {
    const message = typeof payload.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : 'MCP tool request failed';
    throw new Error(message);
  }

  if (payload && typeof payload === 'object' && payload.status === 'success' && 'data' in payload) {
    return payload.data;
  }

  return payload;
}

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

  const providesDataObjects = useMemo(() => {
    const next = {};
    for (const token of resolveProvideTokens(cardContent)) {
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
    discoverSourceKinds: async () => unwrapMcpToolPayload(await readJsonResponse(
      await callBoardMcp(boardId, 'discover.source-kinds', {}),
    )),
    validateCandidateCardDefinition: async (candidateCardContent = cardContent) => unwrapMcpToolPayload(await readJsonResponse(
      await callBoardMcp(boardId, 'preflight.validate-candidate-card-definition', {
        candidate_card_content: candidateCardContent,
      }),
    )),
    runSingleSourceInLiveCard: async (sourceIndex, options = {}) => {
      const { mockRequires = requiresDataObjects } = options ?? {};
      return unwrapMcpToolPayload(await readJsonResponse(
        await callBoardMcp(boardId, 'preflight.run-single-source-in-live-card', {
          card_id: cardId,
          source_idx: sourceIndex,
          mock_requires: mockRequires,
        }),
      ));
    },
    runSingleSourceInCandidateCard: async (candidateCardContent = cardContent, sourceIndex, options = {}) => {
      const { mockRequires = requiresDataObjects, mockProjections } = options ?? {};
      return unwrapMcpToolPayload(await readJsonResponse(
        await callBoardMcp(boardId, 'preflight.run-single-source-in-candidate-card', {
          candidate_card_content: candidateCardContent,
          source_idx: sourceIndex,
          ...(mockRequires ? { mock_requires: mockRequires } : {}),
          ...(mockProjections ? { mock_projections: mockProjections } : {}),
        }),
      ));
    },
    probeSingleSourceInCandidateCard: async (candidateCardContent = cardContent, sourceIndex, options = {}) => {
      const { mockRequires = requiresDataObjects, mockProjections } = options ?? {};
      return unwrapMcpToolPayload(await readJsonResponse(
        await callBoardMcp(boardId, 'preflight.probe-single-source-in-candidate-card', {
          candidate_card_content: candidateCardContent,
          source_idx: sourceIndex,
          ...(mockRequires ? { mock_requires: mockRequires } : {}),
          ...(mockProjections ? { mock_projections: mockProjections } : {}),
        }),
      ));
    },
    runOneCycleWithCandidateCard: async (candidateCardContent = cardContent, options = {}) => {
      const { mockRequires = requiresDataObjects } = options ?? {};
      return unwrapMcpToolPayload(await readJsonResponse(
        await callBoardMcp(boardId, 'preflight.run-one-cycle-with-candidate-card', {
          candidate_card_content: candidateCardContent,
          mock_requires: mockRequires,
        }),
      ));
    },
  }), [boardId, canRefresh, cardContent, cardId, requiresDataObjects]);

  return {
    boardSseClientId: boardInfo?.sseClientId ?? null,
    cardContent,
    canRefresh,
    cardData,
    cardRuntime,
    requiresDataObjects,
    providesDataObjects,
    cardActions,
  };
}
