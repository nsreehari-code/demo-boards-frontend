import { useCallback, useMemo } from 'react';
import { useChatState } from './useChatState.js';
import { fetchChatMessagesBeforeTurn } from '../lib/chatMessages.js';

/**
 * Chat data hook: the live chat state (messages, processing, watch-party agent
 * activity, actions) plus a backward-pagination action for older turns.
 *
 * `loadPreviousTurns(beforeTurnId, turns)` is a stable callback that resolves to
 * an array of messages strictly before `beforeTurnId`. It is the data source
 * behind the chat pane's `onLoadPrevious` contract.
 */
export function useChatTurns(boardId, cardId) {
  const chat = useChatState(boardId, cardId);

  const loadPreviousTurns = useCallback(
    (beforeTurnId, turns) => fetchChatMessagesBeforeTurn(boardId, cardId, beforeTurnId, turns),
    [boardId, cardId],
  );

  return useMemo(() => {
    if (!chat) return null;
    return { ...chat, loadPreviousTurns };
  }, [chat, loadPreviousTurns]);
}
