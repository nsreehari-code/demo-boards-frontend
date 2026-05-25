import { useCallback, useMemo } from 'react';
import {
  dispatchAction,
  subscribeCardChats,
  subscribeWatchparty,
  unsubscribeCardChats,
  unsubscribeWatchparty,
  uploadFileForChat,
} from '../lib/client.js';
import { COPILOT_OUTPUT_CHANNEL } from '../lib/appConfig.js';
import { useCardState } from './useCardState.js';

export function useChatState(boardId, cardId) {
  const card = useCardState(boardId, cardId);

  if (!card || !cardId) return null;

  const chatState = card.chatState ?? null;
  const boardSseClientId = card.boardSseClientId ?? null;
  const filesUploaded = card.filesUploaded ?? [];
  const latestCopilotOutput = String(card.copilotOutput ?? '');

  const sendChat = useCallback(
    (text, payload = {}) => dispatchAction(boardId, cardId, 'chat-send', { text, ...payload }),
    [boardId, cardId],
  );

  const uploadChatFile = useCallback(
    (file) => uploadFileForChat(boardId, cardId, file),
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

  const chatActions = useMemo(() => ({
    sendChat,
    uploadFileForChat: uploadChatFile,
    subscribeChat,
    unsubscribeChat,
    subscribeCopilotOutput,
    unsubscribeCopilotOutput,
  }), [sendChat, uploadChatFile, subscribeChat, unsubscribeChat, subscribeCopilotOutput, unsubscribeCopilotOutput]);

  return {
    ...(chatState ?? {}),
    copilotOutput: latestCopilotOutput,
    boardSseClientId,
    chatActions,
    filesUploaded,
  };
}
