import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChatTurns } from './useChatTurns.js';
import {
  mergeLiveMessages,
  mergeMessageArrays,
  getMessageTurnId,
  getFirstTurnId,
  countDistinctTurns,
  makeTurnId,
  fetchChatMessagesBeforeTurn,
} from '../lib/chatMessages.js';

const DEFAULT_HISTORY_TURNS_PER_PAGE = 5;

function isPendingFileUploadMessage(msg) {
  if (!msg || msg.role !== 'system') return false;
  const text = typeof msg.text === 'string' ? msg.text.trim() : '';
  return /^file uploaded:/i.test(text);
}

// Subscribe to chat SSE on mount so the server sends card_chats notifications.
function useChatSubscription(subscribeChat, unsubscribeChat, boardId, cardId, boardSseClientId) {
  useEffect(() => {
    if (!subscribeChat || !unsubscribeChat || !boardId || !cardId || !boardSseClientId) return;
    subscribeChat().catch(() => {});
    return () => {
      unsubscribeChat().catch(() => {});
    };
  }, [subscribeChat, unsubscribeChat, boardId, cardId, boardSseClientId]);
}

/**
 * The single source of truth for a card's chat conversation data. Encapsulates
 * the orchestration that the chat pane and the postbox card previously each
 * re-implemented inline:
 *
 *  - the SSE subscription lifecycle,
 *  - live message accumulation (new turns append rather than replace),
 *  - the immutable history/live boundary (`historyAnchorTurnId`),
 *  - backward history pagination, and
 *  - draft turn-id rotation (adopt a pending file-upload turn, then mint a new
 *    one once the turn has been consumed by a sent message).
 *
 * Consumers own only their rendering (and any DOM concerns such as scrolling).
 *
 * Options:
 *  - `historyEnabled`      — when false, expose raw live `messages` with no
 *    accumulation or history surface (used by the mini chat pane).
 *  - `historyTurnsPerPage` — page size for backward pagination.
 */
export function useChatConversation(boardId, cardId, {
  historyEnabled = true,
  historyTurnsPerPage = DEFAULT_HISTORY_TURNS_PER_PAGE,
} = {}) {
  const chat = useChatTurns(boardId, cardId);
  const messages = chat?.messages ?? [];
  const processing = chat?.processing ?? false;
  const chatActions = chat?.chatActions ?? null;
  const boardSseClientId = chat?.boardSseClientId ?? null;
  const onLoadPrevious = chat?.loadPreviousTurns ?? null;

  useChatSubscription(
    chatActions?.subscribeChat,
    chatActions?.unsubscribeChat,
    boardId,
    cardId,
    boardSseClientId,
  );

  // --- Live accumulation + history pagination state ---
  const [liveMessages, setLiveMessages] = useState([]);
  const [historyAnchorTurnId, setHistoryAnchorTurnId] = useState('');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursorTurnId, setCursorTurnId] = useState('');
  const [draftTurnId, setDraftTurnId] = useState(() => makeTurnId());
  const liveKeyRef = useRef('');
  const didInitialFetchRef = useRef(false);

  // Reset all accumulation when the board/card changes so a reused instance does
  // not bleed one conversation into the next. Declared first so it runs before
  // the accumulation effect re-seeds for the new card.
  useEffect(() => {
    setLiveMessages([]);
    setHistory([]);
    setHistoryAnchorTurnId('');
    setHistoryLoading(false);
    setHasMore(true);
    setCursorTurnId('');
    liveKeyRef.current = '';
    didInitialFetchRef.current = false;
  }, [boardId, cardId]);

  // Accumulate live SSE messages so new turns append rather than replace the
  // already-rendered conversation (the SSE chat view may only carry the latest
  // turn).
  useEffect(() => {
    if (!historyEnabled) return;
    const key = `${boardId}::${cardId}`;
    setLiveMessages((prev) => {
      if (liveKeyRef.current !== key) {
        liveKeyRef.current = key;
        return mergeLiveMessages([], messages);
      }
      return mergeLiveMessages(prev, messages);
    });
  }, [historyEnabled, boardId, cardId, messages]);

  const liveForDisplay = useMemo(
    () => (historyEnabled ? liveMessages.map((entry) => entry.msg) : messages),
    [historyEnabled, liveMessages, messages],
  );

  const firstLiveTurnId = useMemo(
    () => getFirstTurnId(liveForDisplay),
    [liveForDisplay],
  );

  // Lock the history/live boundary once: the first turn id the live stream
  // shows becomes the immutable anchor. History is everything strictly before
  // it; the live forward stream owns this turn and everything after.
  useEffect(() => {
    if (!historyEnabled || historyAnchorTurnId || !firstLiveTurnId) {
      return;
    }
    setHistoryAnchorTurnId(firstLiveTurnId);
  }, [historyEnabled, historyAnchorTurnId, firstLiveTurnId]);

  const loadBefore = useCallback(async (turnId) => {
    if (!turnId || typeof onLoadPrevious !== 'function') return;
    setHistoryLoading(true);
    try {
      const older = await onLoadPrevious(turnId, historyTurnsPerPage);
      if (!Array.isArray(older) || older.length === 0) {
        setHasMore(false);
        return;
      }
      setHistory((prev) => mergeMessageArrays(older, prev));
      const nextCursorTurnId = getFirstTurnId(older);
      if (!nextCursorTurnId || nextCursorTurnId === turnId) {
        setHasMore(false);
        return;
      }
      setCursorTurnId(nextCursorTurnId);
      setHasMore(countDistinctTurns(older) >= historyTurnsPerPage);
    } catch {
      setHasMore(false);
    } finally {
      setHistoryLoading(false);
    }
  }, [onLoadPrevious, historyTurnsPerPage]);

  // Exactly one automatic fetch, anchored at the immutable boundary turn id.
  useEffect(() => {
    if (!historyEnabled || didInitialFetchRef.current || !historyAnchorTurnId) return;
    didInitialFetchRef.current = true;
    setCursorTurnId(historyAnchorTurnId);
    void loadBefore(historyAnchorTurnId);
  }, [historyEnabled, historyAnchorTurnId, loadBefore]);

  const showPrevious = useCallback(() => {
    if (historyLoading) return;
    void loadBefore(cursorTurnId);
  }, [historyLoading, cursorTurnId, loadBefore]);

  // Pull the newest page of turns into history. Used after a submit so a
  // freshly-sent turn appears immediately in views built from history.
  const refreshLatest = useCallback(async () => {
    const latest = await fetchChatMessagesBeforeTurn(boardId, cardId, '', historyTurnsPerPage);
    if (latest.length > 0) {
      setHistory((current) => mergeMessageArrays(current, latest));
    }
  }, [boardId, cardId, historyTurnsPerPage]);

  // Rotate the draft turn id: adopt a pending file-upload turn, then mint a new
  // one once that turn has been consumed by a sent message.
  useEffect(() => {
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    const lastTurnId = getMessageTurnId(lastMsg);
    if (isPendingFileUploadMessage(lastMsg) && lastTurnId) {
      if (draftTurnId !== lastTurnId) {
        setDraftTurnId(lastTurnId);
      }
      return;
    }
    if (lastMsg && lastTurnId && lastTurnId === draftTurnId) {
      setDraftTurnId(makeTurnId());
    }
  }, [messages, draftTurnId]);

  const rotateDraftTurn = useCallback(() => {
    setDraftTurnId(makeTurnId());
  }, []);

  return {
    chat,
    messages,
    processing,
    chatActions,
    boardSseClientId,
    agentOutput: chat?.agentOutput ?? '',
    agentTools: chat?.agentTools ?? '',
    liveMessages: liveForDisplay,
    historyMessages: history,
    historyAnchorTurnId,
    hasMore,
    historyLoading,
    canLoadMore: !!cursorTurnId,
    showPrevious,
    refreshLatest,
    draftTurnId,
    rotateDraftTurn,
  };
}

export default useChatConversation;
