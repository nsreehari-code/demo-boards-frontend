import { useCallback, useEffect, useMemo } from 'react';
import {
  dispatchAction,
  subscribeCardChats,
  subscribeWatchparty,
  unsubscribeCardChats,
  unsubscribeWatchparty,
  uploadFileForChat,
} from '../lib/client.js';
import { COPILOT_OUTPUT_CHANNEL, COPILOT_TOOLS_CHANNEL } from '../lib/appConfig.js';
import { useBoardInfo, useCardChatProcessing, useCardChatViews, useCardChatWatchParty } from './useSseSlices.js';

export function useChatState(boardId, cardId) {
  const boardInfo = useBoardInfo(boardId);
  const chat = useCardChatViews(boardId, cardId);

  if (!chat || !cardId) return null;

  const chatState = chat.chatState ?? null;
  const boardSseClientId = boardInfo?.sseClientId ?? null;

  const sendChat = useCallback(
    (text, payload = {}) => {
      const { turnId, ...rest } = payload ?? {};
      const normalizedTurnId = typeof turnId === 'string' && turnId.trim() ? turnId.trim() : '';
      const finalPayload = {
        text,
        ...rest,
        ...(normalizedTurnId ? { 'turn-id': normalizedTurnId } : {}),
      };
      return dispatchAction(boardId, cardId, 'chat-send', finalPayload);
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

  return {
    ...(chatState ?? {}),
    boardSseClientId,
    chatActions,
  };
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

    subscribeWatchparty(boardId, cardId, COPILOT_OUTPUT_CHANNEL, boardSseClientId).catch(() => {});
    subscribeWatchparty(boardId, cardId, COPILOT_TOOLS_CHANNEL, boardSseClientId).catch(() => {});

    return () => {
      unsubscribeWatchparty(boardId, cardId, COPILOT_TOOLS_CHANNEL, boardSseClientId).catch(() => {});
      unsubscribeWatchparty(boardId, cardId, COPILOT_OUTPUT_CHANNEL, boardSseClientId).catch(() => {});
    };
  }, [boardId, cardId, boardSseClientId]);

  return {
    copilotOutput: watchParty?.copilotOutput ?? '',
    copilotTools: watchParty?.copilotTools ?? '',
  };
}
