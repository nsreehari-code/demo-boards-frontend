import React from 'react';
import { MessageList } from './ChatMessageList.jsx';
import { AgentWorkingBubble } from './AgentWorkingBubble.jsx';

/**
 * Presentational live surface: the forward (live) message bubbles plus the
 * agent "working" bubble while a turn is in flight. State is owned by the parent
 * (ChatPaneBubblesList); this component only renders.
 */
export function ChatPaneLive({
  boardId,
  cardId,
  compact,
  openMsgId,
  onToggleExpand,
  entries,
  processing,
  agentOutput,
  agentTools,
  onWorkingBubbleLayoutChange,
}) {
  return (
    <>
      <MessageList
        messages={entries}
        compact={compact}
        boardId={boardId}
        cardId={cardId}
        openMsgId={openMsgId}
        onToggleExpand={onToggleExpand}
        idPrefix="live"
      />
      {processing ? (
        <AgentWorkingBubble
          cardId={cardId}
          agentOutput={agentOutput}
          agentTools={agentTools}
          compact={compact}
          onLayoutChange={onWorkingBubbleLayoutChange}
        />
      ) : null}
    </>
  );
}

export default ChatPaneLive;
