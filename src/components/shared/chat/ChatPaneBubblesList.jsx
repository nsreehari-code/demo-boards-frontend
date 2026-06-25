import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatPaneHistory } from './ChatPaneHistory.jsx';
import { ChatPaneLive } from './ChatPaneLive.jsx';
import {
  mergeLiveMessages,
  mergeMessageArrays,
  getFirstTurnId,
  countDistinctTurns,
} from '../../../lib/chatMessages.js';

const DEFAULT_HISTORY_TURNS_PER_PAGE = 5;

/**
 * The scrollable conversation surface. Owns:
 *  - scroll stickiness (stay pinned to the bottom unless the user scrolls up),
 *  - live SSE message accumulation + the immutable history/live boundary,
 *  - backward history pagination via the injected `onLoadPrevious` callback.
 *
 * It composes the presentational ChatPaneHistory and ChatPaneLive surfaces.
 *
 * Props:
 *  - `messages`       — raw live messages from chat state.
 *  - `processing`     — whether a turn is in flight (drives the working bubble).
 *  - `agentOutput`/`agentTools` — live watch-party agent activity.
 *  - `historyEnabled` — when false, render raw `messages` with no history surface.
 *  - `onLoadPrevious(currentTurnId, numTurns)` — callback resolving to an array
 *    of older messages strictly before `currentTurnId`. Required for history.
 */
export function ChatPaneBubblesList({
  boardId,
  cardId,
  messages,
  processing = false,
  agentOutput = '',
  agentTools = '',
  compact = false,
  historyEnabled = false,
  onLoadPrevious,
  historyTurnsPerPage = DEFAULT_HISTORY_TURNS_PER_PAGE,
}) {
  const messagesRef = useRef(null);
  const bottomRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const scrollFrameRef = useRef(null);

  const [openMsgId, setOpenMsgId] = useState(null);
  const [liveMessages, setLiveMessages] = useState([]);
  const [historyAnchorTurnId, setHistoryAnchorTurnId] = useState('');
  const liveKeyRef = useRef('');

  const handleToggleExpand = useCallback((msgId) => {
    setOpenMsgId((prev) => (prev === msgId ? null : msgId));
  }, []);

  // Accumulate live SSE messages so new turns append rather than replace the
  // already-rendered conversation (the SSE chat view may only carry the latest
  // turn). Reset accumulation when the board/card changes.
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

  const displayMessages = useMemo(
    () => liveForDisplay.map((msg) => ({ msg, isHistory: false })),
    [liveForDisplay],
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

  // --- History pagination (owned here, driven by onLoadPrevious) ---
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursorTurnId, setCursorTurnId] = useState('');
  const didInitialFetchRef = useRef(false);

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

  const handleShowPrevious = useCallback(() => {
    if (historyLoading) return;
    void loadBefore(cursorTurnId);
  }, [historyLoading, cursorTurnId, loadBefore]);

  const historyEntries = useMemo(
    () => history.map((msg) => ({ msg, isHistory: true })),
    [history],
  );

  // --- Scroll stickiness ---
  const scrollToBottom = (behavior = 'auto') => {
    const element = messagesRef.current;
    if (!element) {
      bottomRef.current?.scrollIntoView({ behavior });
      return;
    }

    element.scrollTo({
      top: element.scrollHeight,
      behavior,
    });
  };

  const scheduleScrollToBottom = useCallback((behavior = 'auto') => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      scrollToBottom(behavior);
    });
  }, []);

  useEffect(() => {
    const element = messagesRef.current;
    if (!element) {
      return undefined;
    }

    const updateStickyState = () => {
      const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
      shouldStickToBottomRef.current = distanceFromBottom <= 72;
    };

    updateStickyState();
    element.addEventListener('scroll', updateStickyState, { passive: true });
    return () => element.removeEventListener('scroll', updateStickyState);
  }, []);

  useEffect(() => {
    if (initialScrollDoneRef.current) {
      return;
    }

    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      scrollToBottom('auto');
      shouldStickToBottomRef.current = true;
      initialScrollDoneRef.current = true;
    });

    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [messages.length, processing, boardId, cardId]);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }

    scheduleScrollToBottom(messages.length > 0 || processing ? 'smooth' : 'auto');

    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [messages.length, processing]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  const handleWorkingBubbleLayoutChange = useCallback(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }

    scheduleScrollToBottom('auto');
  }, [scheduleScrollToBottom]);

  return (
    <div ref={messagesRef} className="board-chat-pane__messages p-2">
      {historyEnabled && historyAnchorTurnId ? (
        <ChatPaneHistory
          boardId={boardId}
          cardId={cardId}
          compact={compact}
          openMsgId={openMsgId}
          onToggleExpand={handleToggleExpand}
          entries={historyEntries}
          hasMore={hasMore}
          loading={historyLoading}
          canLoadMore={!!cursorTurnId}
          onShowPrevious={handleShowPrevious}
        />
      ) : null}
      <ChatPaneLive
        boardId={boardId}
        cardId={cardId}
        compact={compact}
        openMsgId={openMsgId}
        onToggleExpand={handleToggleExpand}
        entries={displayMessages}
        processing={processing}
        agentOutput={agentOutput}
        agentTools={agentTools}
        onWorkingBubbleLayoutChange={handleWorkingBubbleLayoutChange}
      />
      <div ref={bottomRef} />
    </div>
  );
}

export default ChatPaneBubblesList;
