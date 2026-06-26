import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChatPaneHistory } from './ChatPaneHistory.jsx';
import { ChatPaneLive } from './ChatPaneLive.jsx';

/**
 * The scrollable conversation surface. Owns only the view concerns:
 *  - scroll stickiness (stay pinned to the bottom unless the user scrolls up),
 *  - the expand/collapse UI state for individual bubbles.
 *
 * All chat data orchestration (live accumulation, the immutable history/live
 * boundary, and backward pagination) lives in useChatConversation; this
 * component renders the already-orchestrated `liveMessages` / `historyMessages`
 * and composes the presentational ChatPaneHistory and ChatPaneLive surfaces.
 *
 * Props:
 *  - `liveMessages`   — display-ready live messages (raw msg objects).
 *  - `historyMessages`— display-ready older messages (raw msg objects).
 *  - `processing`     — whether a turn is in flight (drives the working bubble).
 *  - `agentOutput`/`agentTools` — live watch-party agent activity.
 *  - `historyEnabled` — render the history surface when an anchor exists.
 *  - `hasMore`/`historyLoading`/`canLoadMore`/`onShowPrevious` — pagination.
 */
export function ChatPaneBubblesList({
  boardId,
  cardId,
  compact = false,
  processing = false,
  agentOutput = '',
  agentTools = '',
  liveMessages = [],
  historyMessages = [],
  historyEnabled = false,
  historyAnchorTurnId = '',
  hasMore = false,
  historyLoading = false,
  canLoadMore = false,
  onShowPrevious,
}) {
  const messagesRef = useRef(null);
  const bottomRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const scrollFrameRef = useRef(null);

  const [openMsgId, setOpenMsgId] = useState(null);

  const handleToggleExpand = useCallback((msgId) => {
    setOpenMsgId((prev) => (prev === msgId ? null : msgId));
  }, []);

  const displayMessages = useMemo(
    () => liveMessages.map((msg) => ({ msg, isHistory: false })),
    [liveMessages],
  );

  const historyEntries = useMemo(
    () => historyMessages.map((msg) => ({ msg, isHistory: true })),
    [historyMessages],
  );

  const liveCount = liveMessages.length;

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
  }, [liveCount, processing, boardId, cardId]);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }

    scheduleScrollToBottom(liveCount > 0 || processing ? 'smooth' : 'auto');

    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [liveCount, processing]);

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
          canLoadMore={canLoadMore}
          onShowPrevious={onShowPrevious}
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
