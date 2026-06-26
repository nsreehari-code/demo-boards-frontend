import React from 'react';
import { useChatConversation } from '../../../hooks/useChatConversation.js';
import { ChatPaneBubblesList } from './ChatPaneBubblesList.jsx';
import { ChatInput } from './ChatInput.jsx';

function ChatPopoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 5h5v5" />
      <path d="M10 14 19 5" />
      <path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
    </svg>
  );
}

function ChatPaneBase({
  boardId,
  cardId,
  readOnly = false,
  compact = false,
  composerVariant = 'default',
  className = '',
  headerContent = null,
  historyEnabled = false,
}) {
  const conv = useChatConversation(boardId, cardId, { historyEnabled });

  if (!conv.chat) return null;

  const { processing, chatActions, draftTurnId } = conv;

  return (
    <div className={`board-chat-pane ${className}`.trim()}>
      {headerContent}
      <ChatPaneBubblesList
        boardId={boardId}
        cardId={cardId}
        compact={compact}
        processing={processing}
        agentOutput={conv.agentOutput}
        agentTools={conv.agentTools}
        liveMessages={conv.liveMessages}
        historyMessages={conv.historyMessages}
        historyEnabled={historyEnabled}
        historyAnchorTurnId={conv.historyAnchorTurnId}
        hasMore={conv.hasMore}
        historyLoading={conv.historyLoading}
        canLoadMore={conv.canLoadMore}
        onShowPrevious={conv.showPrevious}
      />
      {!readOnly && chatActions && !(composerVariant === 'mini' && processing) ? (
        <ChatInput
          chatActions={chatActions}
          processing={processing}
          turnId={draftTurnId}
          cardId={cardId}
          variant={composerVariant}
        />
      ) : null}
    </div>
  );
}

export function ChatPane({ boardId, cardId, readOnly = false, compact = false }) {
  return <ChatPaneBase boardId={boardId} cardId={cardId} readOnly={readOnly} compact={compact} historyEnabled={true} />;
}

export function GandalfChatPane(props) {
  return <ChatPane {...props} />;
}

export function MiniChatPane({ boardId, cardId, readOnly = false, compact = false, onPopout }) {
  const headerContent = onPopout ? (
    <div className="board-chat-pane__mini-header px-2 py-1">
      <div className="board-chat-pane__mini-title">Chat</div>
      <button
        type="button"
        className="board-chat-pane__icon-button board-icon-button board-icon-button--sm"
        onClick={onPopout}
        title="Open full chat"
        aria-label={`Open full chat for ${cardId}`}
      >
        <ChatPopoutIcon />
      </button>
    </div>
  ) : null;

  return (
    <ChatPaneBase
      boardId={boardId}
      cardId={cardId}
      readOnly={readOnly}
      compact={compact}
      composerVariant="mini"
      className="board-chat-pane--mini"
      headerContent={headerContent}
    />
  );
}

export default ChatPane;
