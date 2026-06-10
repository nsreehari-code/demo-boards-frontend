import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useCardState } from '../hooks/useCardState.js';
import { useChatStateAIWorking } from '../hooks/useChatState.js';
import { useBoardInspectState } from '../hooks/useBoardState.js';
import { CardCore } from './CardCore.jsx';
import { ChatPane, MiniChatPane } from './ChatPane.jsx';
import { GlobalModal } from './GlobalModal.jsx';
import { InspectCard } from './InspectCard.jsx';

const CARD_WIDTH_STORAGE_PREFIX = 'demo-board:card-shell-width:';
const MIN_CARD_WIDTH = 280;
const MAX_CARD_WIDTH = 960;

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

function clampCardWidth(nextWidth) {
  const viewportMax = typeof window !== 'undefined'
    ? Math.max(MIN_CARD_WIDTH, Math.min(MAX_CARD_WIDTH, window.innerWidth - 48))
    : MAX_CARD_WIDTH;
  return Math.max(MIN_CARD_WIDTH, Math.min(viewportMax, Math.round(nextWidth)));
}

function readStoredCardWidth(boardId, cardId) {
  if (typeof window === 'undefined' || !boardId || !cardId) return null;
  try {
    const raw = window.localStorage.getItem(`${CARD_WIDTH_STORAGE_PREFIX}${boardId}:${cardId}`);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clampCardWidth(parsed) : null;
  } catch {
    return null;
  }
}

function persistCardWidth(boardId, cardId, width) {
  if (typeof window === 'undefined' || !boardId || !cardId) return;
  try {
    if (Number.isFinite(width) && width > 0) {
      window.localStorage.setItem(`${CARD_WIDTH_STORAGE_PREFIX}${boardId}:${cardId}`, String(clampCardWidth(width)));
    } else {
      window.localStorage.removeItem(`${CARD_WIDTH_STORAGE_PREFIX}${boardId}:${cardId}`);
    }
  } catch {
    // Best-effort persistence only.
  }
}

const CARD_RESIZE_HANDLE_SVG = (
  <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" className="board-card-shell__resize-icon">
    <path fill="currentColor" d="M6.25 4.25a.75.75 0 0 1 .75.75v10a.75.75 0 0 1-1.5 0V5a.75.75 0 0 1 .75-.75Zm3.75 0a.75.75 0 0 1 .75.75v10a.75.75 0 0 1-1.5 0V5a.75.75 0 0 1 .75-.75Zm3.75 0a.75.75 0 0 1 .75.75v10a.75.75 0 0 1-1.5 0V5a.75.75 0 0 1 .75-.75Z" />
  </svg>
);

function ResizableCardShell({ boardId, cardId, className = '', enabled = false, children }) {
  const [width, setWidth] = useState(() => readStoredCardWidth(boardId, cardId));
  const dragStateRef = useRef(null);

  useEffect(() => {
    setWidth(enabled ? readStoredCardWidth(boardId, cardId) : null);
  }, [boardId, cardId, enabled]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const handlePointerMove = (event) => {
      const drag = dragStateRef.current;
      if (!drag) return;
      setWidth(clampCardWidth(drag.startWidth + (event.clientX - drag.startX)));
    };

    const handlePointerUp = () => {
      if (!dragStateRef.current) return;
      dragStateRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      persistCardWidth(boardId, cardId, width);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      if (dragStateRef.current) {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    };
  }, [boardId, cardId, enabled, width]);

  const handleResizeStart = useCallback((event) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
    dragStateRef.current = {
      startX: event.clientX,
      startWidth: width || event.currentTarget.closest('.board-card-shell')?.getBoundingClientRect().width || MIN_CARD_WIDTH,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
  }, [enabled, width]);

  const handleResetWidth = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setWidth(null);
    persistCardWidth(boardId, cardId, null);
  }, [boardId, cardId]);

  return (
    <div className={`board-card-shell${className ? ` ${className}` : ''}`} style={width ? { width: `${width}px` } : undefined}>
      {children}
      {enabled ? (
        <button
          type="button"
          className="board-card-shell__resize-handle"
          onPointerDown={handleResizeStart}
          onDoubleClick={handleResetWidth}
          title="Drag to resize card width. Double-click to reset."
          aria-label="Resize card width"
        >
          {CARD_RESIZE_HANDLE_SVG}
        </button>
      ) : null}
    </div>
  );
}

function CardShellComponent({ boardId, cardId, renderInInspect = false, enableResize = false }) {
  if (renderInInspect) {
    return <CardShellInspectView boardId={boardId} cardId={cardId} />;
  }
  return <CardShellBoardView boardId={boardId} cardId={cardId} enableResize={enableResize} />;
}

function CardShellInspectView({ boardId, cardId }) {
  const cardState = useCardState(boardId, cardId);
  if (!cardState?.cardContent) return null;
  const title = cardState.cardContent.meta?.title ?? cardId;
  const status = cardState.cardRuntime?.status ?? 'fresh';
  const statusTone = getStatusTone(status);
  return (
    <ResizableCardShell boardId={boardId} cardId={cardId} className="board-card-shell--inspect">
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
    </ResizableCardShell>
  );
}

function CardShellBoardView({ boardId, cardId, enableResize = false }) {
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
      <ResizableCardShell boardId={boardId} cardId={cardId} enabled={enableResize}>
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
      </ResizableCardShell>

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
