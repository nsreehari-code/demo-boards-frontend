import React, { memo, useCallback, useState } from 'react';
import { useCardState } from '../hooks/useCardState.js';
import { useChatStateAIWorking } from '../hooks/useChatState.js';
import { useBoardInspectState } from '../hooks/useBoardState.js';
import { CardCore } from './CardCore.jsx';
import { ChatPane, MiniChatPane } from './ChatPane.jsx';
import { GlobalModal } from './GlobalModal.jsx';
import { InspectCard } from './InspectCard.jsx';

const CHAT_PROCESSING_PULSE_STYLE = {
  animation: 'card-shell-chat-pulse 0.9s ease-in-out infinite',
  transformOrigin: 'center',
};

function ChatIconWithClose() {
  return (
    <span className="board-chat-toggle-icon" aria-hidden="true">
      <i className="bi bi-chat" />
      <span className="board-chat-toggle-icon__close">
        <i className="bi bi-x" />
      </span>
    </span>
  );
}

const ChatHeaderButton = memo(function ChatHeaderButton({ boardId, cardId, chatOpen, onToggleChat }) {
  const chatProcessing = useChatStateAIWorking(boardId, cardId);
  return (
    <button
      type="button"
      className="board-icon-button"
      onClick={onToggleChat}
      title={chatOpen ? 'Close chat' : chatProcessing ? 'Chat processing' : 'Open chat'}
      aria-label={chatOpen ? `Close chat for ${cardId}` : chatProcessing ? `Chat processing for ${cardId}` : `Open chat for ${cardId}`}
      data-testid={`card-shell-open-chat-${cardId}`}
    >
      <span style={chatProcessing ? CHAT_PROCESSING_PULSE_STYLE : undefined}>
        {chatOpen ? <ChatIconWithClose /> : <i className="bi bi-chat" />}
      </span>
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
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [theme] = useState(() => (
    typeof document !== 'undefined'
      ? document.querySelector('.board-app-shell[data-theme]')?.getAttribute('data-theme') ?? null
      : null
  ));
  const handleToggleChat = useCallback(() => {
    setChatOpen((current) => !current);
  }, []);
  const handleOpenChatModal = useCallback(() => {
    setChatOpen(false);
    setChatModalOpen(true);
  }, []);

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
                chatOpen={chatOpen}
                onToggleChat={handleToggleChat}
              />
            </div>
        </div>
        <div className={`board-card__body${chatOpen ? ' board-card__body--with-mini-chat' : ''}`}>
          {chatOpen ? (
            <div className="board-card__mini-chat">
              <MiniChatPane boardId={boardId} cardId={cardId} onPopout={handleOpenChatModal} />
            </div>
          ) : null}
          <div className="board-card__content">
            <CardCore boardId={boardId} cardId={cardId} />
          </div>
        </div>
      </div>

      {chatModalOpen ? (
        <GlobalModal
          title={`Chat: ${title}`}
          onClose={() => setChatModalOpen(false)}
          className="global-modal--chat"
          bodyClassName="global-modal__body--chat"
        >
          <div className="board-app-shell chat-modal__theme-scope" data-theme={theme ?? undefined}>
            <div data-testid={`chat-modal-${cardId}`} style={{ height: '100%' }}>
              <ChatPane boardId={boardId} cardId={cardId} />
            </div>
          </div>
        </GlobalModal>
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
