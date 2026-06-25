import React from 'react';
import { MessageList } from './ChatMessageList.jsx';

function ChatTurnHistoryButton({ loading, disabled, onClick }) {
  return (
    <div className="board-chat-pane__history-row text-center my-1">
      <button
        type="button"
        className="btn btn-link btn-sm p-0 text-decoration-none"
        onClick={onClick}
        disabled={disabled || loading}
      >
        {loading ? 'Loading previous messages…' : 'Show previous messages'}
      </button>
    </div>
  );
}

/**
 * Presentational history surface: a "Show previous messages" button plus the
 * already-fetched older message bubbles. All pagination state is owned by the
 * parent (ChatPaneBubblesList); this component only renders and reports clicks.
 */
export function ChatPaneHistory({
  boardId,
  cardId,
  compact,
  openMsgId,
  onToggleExpand,
  entries,
  hasMore,
  loading,
  canLoadMore,
  onShowPrevious,
}) {
  if (entries.length === 0 && !hasMore) {
    return null;
  }

  return (
    <>
      {hasMore ? (
        <ChatTurnHistoryButton
          loading={loading}
          disabled={!canLoadMore || loading}
          onClick={onShowPrevious}
        />
      ) : null}
      <MessageList
        messages={entries}
        compact={compact}
        boardId={boardId}
        cardId={cardId}
        openMsgId={openMsgId}
        onToggleExpand={onToggleExpand}
        idPrefix="history"
      />
    </>
  );
}

export default ChatPaneHistory;
