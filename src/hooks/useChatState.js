import { useCallback, useEffect, useMemo } from 'react';
import {
  addChatEntryAndAnyAttachments,
  subscribeCardChats,
  subscribeWatchparty,
  unsubscribeCardChats,
  unsubscribeWatchparty,
  uploadFileForChat,
} from '../lib/client.js';
import { AGENT_OUTPUT_CHANNEL, AGENT_TOOLS_CHANNEL } from '../lib/appConfig.js';
import { useBoardInfo, useCardChatProcessing, useCardChatViews, useCardChatWatchParty } from './useSseSlices.js';

export function useChatState(boardId, cardId) {
  const boardInfo = useBoardInfo(boardId);
  const chat = useCardChatViews(boardId, cardId);

  const chatState = chat?.chatState ?? null;
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

  const subscribeChat = useCallback(() => {
    if (!boardSseClientId) return Promise.resolve(null);
    return subscribeCardChats(boardId, cardId, boardSseClientId);
  }, [boardId, cardId, boardSseClientId]);

  const unsubscribeChat = useCallback(() => {
    if (!boardSseClientId) return Promise.resolve(null);
    return unsubscribeCardChats(boardId, cardId, boardSseClientId);
  }, [boardId, cardId, boardSseClientId]);

  const chatActions = useMemo(() => ({
    sendChat,
    uploadFileForChat: uploadChatFile,
    subscribeChat,
    unsubscribeChat,
  }), [sendChat, uploadChatFile, subscribeChat, unsubscribeChat]);

  return useMemo(() => {
    if (!chat || !cardId) return null;
    return {
      ...(chatState ?? {}),
      boardSseClientId,
      chatActions,
    };
  }, [chat, cardId, chatState, boardSseClientId, chatActions]);
}

export function useChatStateAIWorking(boardId, cardId) {
  return useCardChatProcessing(boardId, cardId);
}

export function useChatWatchParty(boardId, cardId) {
  const boardInfo = useBoardInfo(boardId);
  const watchParty = useCardChatWatchParty(boardId, cardId);
  const boardSseClientId = boardInfo?.sseClientId ?? null;

  useEffect(() => {
    if (!boardId || !cardId || !boardSseClientId) return undefined;

    subscribeWatchparty(boardId, cardId, AGENT_OUTPUT_CHANNEL, boardSseClientId).catch(() => {});
    subscribeWatchparty(boardId, cardId, AGENT_TOOLS_CHANNEL, boardSseClientId).catch(() => {});

    return () => {
      unsubscribeWatchparty(boardId, cardId, AGENT_TOOLS_CHANNEL, boardSseClientId).catch(() => {});
      unsubscribeWatchparty(boardId, cardId, AGENT_OUTPUT_CHANNEL, boardSseClientId).catch(() => {});
    };
  }, [boardId, cardId, boardSseClientId]);

  return {
    agentOutput: watchParty?.agentOutput ?? '',
    agentTools: watchParty?.agentTools ?? '',
  };
}
