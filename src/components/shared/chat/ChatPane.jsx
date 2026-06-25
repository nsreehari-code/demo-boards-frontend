import React, { useEffect, useState } from 'react';
import { useChatTurns } from '../../../hooks/useChatTurns.js';
import { ChatPaneBubblesList } from './ChatPaneBubblesList.jsx';
import { ChatInput } from './ChatInput.jsx';
import { makeTurnId } from '../../../lib/chatMessages.js';

function ChatPopoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 5h5v5" />
      <path d="M10 14 19 5" />
      <path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
    </svg>
  );
}

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
  const chat = useChatTurns(boardId, cardId);
  const messages = chat?.messages ?? [];
  const processing = chat?.processing ?? false;
  const chatActions = chat?.chatActions ?? null;
  const boardSseClientId = chat?.boardSseClientId ?? null;
  const onLoadPrevious = chat?.loadPreviousTurns ?? null;

  const [draftTurnId, setDraftTurnId] = useState(() => makeTurnId());

  // Rotate the draft turn id: adopt a pending file-upload turn, then mint a new
  // one once that turn has been consumed by a sent message.
  useEffect(() => {
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    if (isPendingFileUploadMessage(lastMsg) && typeof lastMsg.turn === 'string' && lastMsg.turn.trim()) {
      if (draftTurnId !== lastMsg.turn) {
        setDraftTurnId(lastMsg.turn);
      }
      return;
    }
    if (lastMsg && typeof lastMsg.turn === 'string' && lastMsg.turn.trim() === draftTurnId) {
      setDraftTurnId(makeTurnId());
    }
  }, [messages, draftTurnId]);

  useChatSubscription(
    chatActions?.subscribeChat,
    chatActions?.unsubscribeChat,
    boardId,
    cardId,
    boardSseClientId,
  );

  if (!chat) return null;

  return (
    <div className={`board-chat-pane ${className}`.trim()}>
      {headerContent}
      <ChatPaneBubblesList
        boardId={boardId}
        cardId={cardId}
        messages={messages}
        processing={processing}
        agentOutput={chat?.agentOutput}
        agentTools={chat?.agentTools}
        compact={compact}
        historyEnabled={historyEnabled}
        onLoadPrevious={onLoadPrevious}
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
