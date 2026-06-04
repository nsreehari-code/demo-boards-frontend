import React, { memo, useCallback, useEffect, useState } from 'react';
import { useCardState } from '../hooks/useCardState.js';
import { useChatStateAIWorking } from '../hooks/useChatState.js';
import { useBoardInspectState } from '../hooks/useBoardState.js';
import { CardCore } from './CardCore.jsx';
import { ChatPane } from './ChatPane.jsx';
import { InspectCard } from './InspectCard.jsx';

const CHAT_PROCESSING_PULSE_STYLE = {
  animation: 'card-shell-chat-pulse 0.9s ease-in-out infinite',
  transformOrigin: 'center',
};

const ChatHeaderButton = memo(function ChatHeaderButton({ boardId, cardId, onOpenChat }) {
  const chatProcessing = useChatStateAIWorking(boardId, cardId);
  return (
    <button
      type="button"
      className="board-icon-button"
      onClick={onOpenChat}
      title={chatProcessing ? 'Chat processing' : 'Open chat'}
    >
      <i className="bi bi-chat" style={chatProcessing ? CHAT_PROCESSING_PULSE_STYLE : undefined} />
    </button>
  );
});

const CLOSE_DETAILS_SVG = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <line x1="5" y1="7" x2="14" y2="7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <circle cx="17" cy="7" r="1.8" fill="currentColor" />
    <line x1="10" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <circle cx="7" cy="12" r="1.8" fill="currentColor" />
    <line x1="5" y1="17" x2="14" y2="17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <circle cx="17" cy="17" r="1.8" fill="currentColor" />
    <line x1="15.8" y1="14.8" x2="21.2" y2="20.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <line x1="21.2" y1="14.8" x2="15.8" y2="20.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);

function getStatusTone(status) {
  switch (status) {
    case 'completed':
      return 'board-tone--completed';
    case 'running':
      return 'board-tone--running';
    case 'failed':
      return 'board-tone--failed';
    case 'blocked':
      return 'board-tone--blocked';
    default:
      return 'board-tone--fresh';
  }
}

function ChatModal({ boardId, cardId, title, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="board-modal position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{ zIndex: 1200, padding: '1rem' }}
      onClick={onClose}
    >
      <div
        className="board-modal__dialog w-100"
        style={{ maxWidth: '960px', height: 'min(90vh, 720px)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="board-modal__header d-flex align-items-center justify-content-between gap-2 px-3 py-3">
          <div className="board-modal__title text-truncate">Chat: {title}</div>
          <button type="button" className="board-icon-button" onClick={onClose} title="Close chat">
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <div className="board-modal__body" style={{ height: 'calc(100% - 65px)' }}>
          <ChatPane boardId={boardId} cardId={cardId} />
        </div>
      </div>
    </div>
  );
}

function CardShellComponent({ boardId, cardId, renderInInspect = false }) {
  if (renderInInspect) {
    return <CardShellInspectView boardId={boardId} cardId={cardId} />;
  }
  return <CardShellBoardView boardId={boardId} cardId={cardId} />;
}

function CardShellInspectView({ boardId, cardId }) {
  const cardState = useCardState(boardId, cardId);
  if (!cardState?.cardContent) return null;
  const title = cardState.cardContent.meta?.title ?? cardId;
  const status = cardState.cardRuntime?.status ?? 'fresh';
  const statusTone = getStatusTone(status);
  return (
    <div className={`board-card ${statusTone}`}>
      <div className="board-card__header">
        <div className="board-card__title-wrap">
          <div className="board-card__title-block">
            <div className="board-card__title text-truncate">{title}</div>
            <div className="board-card__meta">
              {status !== 'completed' ? <span className={`board-status-pill ${statusTone}`}>{status}</span> : null}
            </div>
          </div>
        </div>
      </div>
      <div className="board-card__body">
        <CardCore boardId={boardId} cardId={cardId} />
      </div>
    </div>
  );
}

function CardShellBoardView({ boardId, cardId }) {
  const cardState = useCardState(boardId, cardId);
  const { inspectedCardId, setInspectedCardId } = useBoardInspectState(boardId);
  const [chatOpen, setChatOpen] = useState(false);
  const handleOpenChat = useCallback(() => setChatOpen(true), []);

  if (!cardState?.cardContent) return null;

  const title = cardState.cardContent.meta?.title ?? cardId;
  const status = cardState.cardRuntime?.status ?? 'fresh';
  const statusTone = getStatusTone(status);
  const inspectOpen = inspectedCardId === cardId;
  const refreshDisabled = cardState.cardRuntime?.status === 'running';
  const showRefresh = cardState.canRefresh === true;

  return (
    <>
      <div className={`board-card ${statusTone}`}>
        <div
          className="board-card__header"
          onDoubleClick={(event) => {
            if (event.target.closest('button')) return;
            event.stopPropagation();
            window.dispatchEvent(new CustomEvent('demo-board:toggle-card-focus', {
              detail: { boardId, cardId },
            }));
          }}
        >
          <div className="board-card__title-wrap">
            <div className="board-card__title-block">
              <div className="board-card__title text-truncate">{title}</div>
              <div className="board-card__meta">
                {status !== 'completed' ? <span className={`board-status-pill ${statusTone}`}>{status}</span> : null}
              </div>
            </div>
          </div>
          <div className="board-card__actions">
            <button
              type="button"
              className="board-icon-button"
              onClick={() => setInspectedCardId((current) => (current === cardId ? null : cardId))}
                title={inspectOpen ? 'Close inspect view' : 'Show source information'}
                aria-label={inspectOpen ? 'Close inspect view' : 'Show source information'}
              >
                {inspectOpen ? CLOSE_DETAILS_SVG : <i className="bi bi-sliders2" aria-hidden="true" style={{ fontSize: '0.95rem' }} />}
              </button>
              {showRefresh ? (
                refreshDisabled ? (
                  <span
                    className="board-icon-button disabled"
                    aria-label="Refreshing"
                    title="Refreshing"
                  >
                    <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                  </span>
                ) : (
                  <button
                    type="button"
                    className="board-icon-button"
                    onClick={() => cardState.cardActions?.refresh()}
                    title="Refresh"
                  >
                    <i className="bi bi-arrow-clockwise" />
                  </button>
                )
              ) : null}
              <ChatHeaderButton
                boardId={boardId}
                cardId={cardId}
                onOpenChat={handleOpenChat}
              />
            </div>
        </div>
        <div className="board-card__body">
          <CardCore boardId={boardId} cardId={cardId} />
        </div>
      </div>

      {chatOpen ? (
        <ChatModal boardId={boardId} cardId={cardId} title={title} onClose={() => setChatOpen(false)} />
      ) : null}
      {inspectOpen ? (
        <InspectCard
          boardId={boardId}
          cardId={cardId}
          title={title}
          onClose={() => setInspectedCardId(null)}
        />
      ) : null}
    </>
  );
}

export const CardShell = memo(CardShellComponent);
