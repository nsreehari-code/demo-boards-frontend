import { useCallback, useMemo } from 'react';
import {
  dispatchAction,
  subscribeCardChats,
  subscribeWatchparty,
  unsubscribeCardChats,
  unsubscribeWatchparty,
  uploadFileForChat,
} from '../lib/client.js';
import { COPILOT_OUTPUT_CHANNEL, COPILOT_TOOLS_CHANNEL } from '../lib/appConfig.js';
import { useCardState } from './useCardState.js';

export function useChatState(boardId, cardId) {
  const card = useCardState(boardId, cardId);

  if (!card || !cardId) return null;

  const chatState = card.chatState ?? null;
  const boardSseClientId = card.boardSseClientId ?? null;
  const filesUploaded = card.filesUploaded ?? [];
  const latestCopilotOutput = String(card.copilotOutput ?? '');
  const latestCopilotTools = String(card.copilotTools ?? '');

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

  const subscribeCopilotOutput = useCallback(() => {
    if (!boardSseClientId) return Promise.resolve(null);
    return subscribeWatchparty(boardId, cardId, COPILOT_OUTPUT_CHANNEL, boardSseClientId);
  }, [boardId, cardId, boardSseClientId]);

  const unsubscribeCopilotOutput = useCallback(() => {
    if (!boardSseClientId) return Promise.resolve(null);
    return unsubscribeWatchparty(boardId, cardId, COPILOT_OUTPUT_CHANNEL, boardSseClientId);
  }, [boardId, cardId, boardSseClientId]);

  const subscribeCopilotTools = useCallback(() => {
    if (!boardSseClientId) return Promise.resolve(null);
    return subscribeWatchparty(boardId, cardId, COPILOT_TOOLS_CHANNEL, boardSseClientId);
  }, [boardId, cardId, boardSseClientId]);

  const unsubscribeCopilotTools = useCallback(() => {
    if (!boardSseClientId) return Promise.resolve(null);
    return unsubscribeWatchparty(boardId, cardId, COPILOT_TOOLS_CHANNEL, boardSseClientId);
  }, [boardId, cardId, boardSseClientId]);

  const chatActions = useMemo(() => ({
    sendChat,
    uploadFileForChat: uploadChatFile,
    subscribeChat,
    unsubscribeChat,
    subscribeCopilotOutput,
    unsubscribeCopilotOutput,
    subscribeCopilotTools,
    unsubscribeCopilotTools,
  }), [sendChat, uploadChatFile, subscribeChat, unsubscribeChat, subscribeCopilotOutput, unsubscribeCopilotOutput, subscribeCopilotTools, unsubscribeCopilotTools]);

  return {
    ...(chatState ?? {}),
    copilotOutput: latestCopilotOutput,
    copilotTools: latestCopilotTools,
    boardSseClientId,
    chatActions,
    filesUploaded,
  };
}
