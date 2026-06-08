import { useCallback, useEffect, useMemo } from 'react';
import {
  addChatEntryAndAnyAttachments,
  dispatchAction,
  subscribeCardChats,
  subscribeWatchparty,
  unsubscribeCardChats,
  unsubscribeWatchparty,
  uploadFileForChat,
} from '../lib/client.js';
import { AGENT_OUTPUT_CHANNEL, AGENT_TOOLS_CHANNEL } from '../lib/appConfig.js';
import { useBoardInfo, useCardChatProcessing, useCardChatViews, useCardChatWatchParty } from './useSseSlices.js';

function useReducedWatchParty(boardId, cardId, boardSseClientId) {
  const watchParty = useCardChatWatchParty(boardId, cardId);

  useEffect(() => {
    if (!boardId || !cardId || !boardSseClientId) return undefined;

    subscribeWatchparty(boardId, cardId, AGENT_OUTPUT_CHANNEL, boardSseClientId).catch(() => {});
    subscribeWatchparty(boardId, cardId, AGENT_TOOLS_CHANNEL, boardSseClientId).catch(() => {});

    return () => {
      unsubscribeWatchparty(boardId, cardId, AGENT_TOOLS_CHANNEL, boardSseClientId).catch(() => {});
      unsubscribeWatchparty(boardId, cardId, AGENT_OUTPUT_CHANNEL, boardSseClientId).catch(() => {});
    };
  }, [boardId, cardId, boardSseClientId]);

  return useMemo(() => ({
    agentOutput: watchParty?.agentOutput ?? '',
    agentTools: watchParty?.agentTools ?? '',
  }), [watchParty]);
}

export function useChatActions(boardId, cardId) {
  const boardInfo = useBoardInfo(boardId);
  const boardSseClientId = boardInfo?.sseClientId ?? null;

  const sendChat = useCallback(
    (text, payload = {}) => {
      const { turnId, ...rest } = payload ?? {};
      const normalizedTurnId = typeof turnId === 'string' && turnId.trim() ? turnId.trim() : '';
      return addChatEntryAndAnyAttachments(boardId, cardId, {
        role: typeof rest.role === 'string' && rest.role.trim() ? rest.role.trim() : 'user',
        text,
        turnId: normalizedTurnId,
        files: Array.isArray(rest.files) ? rest.files : [],
      });
    },
    [boardId, cardId],
  );

  const uploadChatFile = useCallback(
    (file, turnId = '') => uploadFileForChat(boardId, cardId, file, turnId),
    [boardId, cardId],
  );

  const sendChatAction = useCallback(
    (text, payload = {}) => {
      const { turnId } = payload ?? {};
      const normalizedTurnId = typeof turnId === 'string' && turnId.trim() ? turnId.trim() : '';
      return dispatchAction(boardId, cardId, 'chat-send', {
        text,
        ...(normalizedTurnId ? { 'turn-id': normalizedTurnId } : null),
      });
    },
    [boardId, cardId],
  );

  const subscribeChat = useCallback(() => {
    if (!boardSseClientId) return Promise.resolve(null);
    return subscribeCardChats(boardId, cardId, boardSseClientId);
  }, [boardId, cardId, boardSseClientId]);

  const unsubscribeChat = useCallback(() => {
    if (!boardSseClientId) return Promise.resolve(null);
    return unsubscribeCardChats(boardId, cardId, boardSseClientId);
  }, [boardId, cardId, boardSseClientId]);

  return useMemo(() => ({
    sendChat,
    sendChatAction,
    uploadFileForChat: uploadChatFile,
    subscribeChat,
    unsubscribeChat,
  }), [sendChat, sendChatAction, uploadChatFile, subscribeChat, unsubscribeChat]);
}

export function useChatState(boardId, cardId) {
  const chat = useCardChatViews(boardId, cardId);
  const boardInfo = useBoardInfo(boardId);
  const chatActions = useChatActions(boardId, cardId);

  const chatState = chat?.chatState ?? null;
  const boardSseClientId = boardInfo?.sseClientId ?? null;
  const watchParty = useReducedWatchParty(boardId, cardId, boardSseClientId);

  return useMemo(() => {
    if (!cardId) return null;
    return {
      messages: Array.isArray(chatState?.messages) ? chatState.messages : [],
      processing: chatState?.processing === true,
      receiving: chatState?.receiving === true,
      agentOutput: watchParty.agentOutput,
      agentTools: watchParty.agentTools,
      watchParty,
      boardSseClientId,
      chatActions,
    };
  }, [cardId, chatState, watchParty, boardSseClientId, chatActions]);
}

export function useChatStateAIWorking(boardId, cardId) {
  return useCardChatProcessing(boardId, cardId);
}

export function useChatWatchParty(boardId, cardId) {
  const boardInfo = useBoardInfo(boardId);
  const boardSseClientId = boardInfo?.sseClientId ?? null;
  return useReducedWatchParty(boardId, cardId, boardSseClientId);
}
