import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useCardWidthState } from '../../../../hooks/useCoordsState.jsx';
import { useCardState } from '../../../../hooks/useCardState.js';
import { useChatStateAIWorking } from '../../../../hooks/useChatState.js';
import { useBoardInspectState } from '../../../../hooks/useBoardState.js';
import { ChatPane, MiniChatPane } from '../../../shared/chat/ChatPane.jsx';
import { GlobalModal } from '../../../shared/GlobalModal.jsx';
import { InspectCard } from './InspectCard.jsx';

// CardChrome is the single owner of all card-tier chrome: the resizable shell,
// the header (title + status + inspect / refresh / chat actions), the path-state
// overlay, the mini-chat + chat modal, and the inspect modal. Every card kind
// (default, strategist, postbox, ingest, ...) renders its body as `children`
// inside this chrome, so chrome behaviour is defined once and is identical
// everywhere. Presentation context is the `chrome` prop, supplied by the pane:
//   full    — board card with the full header (centre pane / canvas)
//   bare    — no header; a floating refresh remains for refreshable cards (rails)
//   inspect — read-only preview frame used inside the inspect modal

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

// Agent-authored lifecycle state of the exploration path this card belongs to.
// Annotation only — never changes graph evaluation; the body content is visually
// marked while all header actions (inspect, refresh, chat) stay live.
const PATH_STATE_DEFS = {
  suspended: { label: 'Suspended', stamp: 'Suspended', tone: 'board-tone--blocked' },
  dead_ended: { label: 'Dead-ended', stamp: 'Ruled out', tone: 'board-tone--failed' },
  wiped: { label: 'Wiped', stamp: 'Wiped', tone: 'board-tone--secondary' },
};

function normalizePathState(meta) {
  const raw = typeof meta?.path_state === 'string' ? meta.path_state.trim().toLowerCase() : '';
  return Object.prototype.hasOwnProperty.call(PATH_STATE_DEFS, raw) ? raw : '';
}

function normalizePathStateRationale(meta) {
  return typeof meta?.path_state_rationale === 'string' ? meta.path_state_rationale.trim() : '';
}

function PathStateOverlay({ pathState, rationale }) {
  const def = PATH_STATE_DEFS[pathState];
  if (!def) return null;
  return (
    <div
      className={`board-card__path-overlay board-card__path-overlay--${pathState}`}
      title={rationale || def.label}
    >
      <span className={`board-card__path-pill ${def.tone}`}>{def.stamp}</span>
    </div>
  );
}

function clampCardWidth(nextWidth) {
  const viewportMax = typeof window !== 'undefined'
    ? Math.max(MIN_CARD_WIDTH, Math.min(MAX_CARD_WIDTH, window.innerWidth - 48))
    : MAX_CARD_WIDTH;
  return Math.max(MIN_CARD_WIDTH, Math.min(viewportMax, Math.round(nextWidth)));
}

const CARD_RESIZE_HANDLE_SVG = (
  <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" className="board-card-shell__resize-icon">
    <path fill="currentColor" d="M6.25 4.25a.75.75 0 0 1 .75.75v10a.75.75 0 0 1-1.5 0V5a.75.75 0 0 1 .75-.75Zm3.75 0a.75.75 0 0 1 .75.75v10a.75.75 0 0 1-1.5 0V5a.75.75 0 0 1 .75-.75Zm3.75 0a.75.75 0 0 1 .75.75v10a.75.75 0 0 1-1.5 0V5a.75.75 0 0 1 .75-.75Z" />
  </svg>
);

function ResizableCardShell({ cardId, className = '', enabled = false, children }) {
  const [width, setWidth] = useCardWidthState(cardId);
  const dragStateRef = useRef(null);

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
  }, [enabled, setWidth]);

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
  }, [setWidth]);

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

function CardChromeInspectView({ boardId, cardId, children }) {
  const cardState = useCardState(boardId, cardId);
  if (!cardState?.cardContent) return null;
  const title = cardState.cardContent.meta?.title ?? cardId;
  const status = cardState.cardRuntime?.status ?? 'fresh';
  const statusTone = getStatusTone(status);
  const pathState = normalizePathState(cardState.cardContent.meta);
  const pathStateRationale = normalizePathStateRationale(cardState.cardContent.meta);
  const pathStateClass = pathState ? ` board-card--path-${pathState}` : '';
  return (
    <ResizableCardShell cardId={cardId} className="board-card-shell--inspect">
      <div className={`board-card ${statusTone}${pathStateClass}`}>
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
          <div className="board-card__content">
            <PathStateOverlay pathState={pathState} rationale={pathStateRationale} />
            {children}
          </div>
        </div>
      </div>
    </ResizableCardShell>
  );
}

function CardChromeBoardView({ boardId, cardId, enableResize, chrome, children }) {
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
  const pathState = normalizePathState(cardState.cardContent.meta);
  const pathStateRationale = normalizePathStateRationale(cardState.cardContent.meta);
  const pathStateClass = pathState ? ` board-card--path-${pathState}` : '';
  const inspectOpen = inspectedCardId === cardId;
  const refreshDisabled = cardState.cardRuntime?.status === 'running';
  const showRefresh = cardState.canRefresh === true;
  const showHeader = chrome === 'full';

  return (
    <>
      <ResizableCardShell cardId={cardId} enabled={enableResize}>
        <div className={`board-card ${statusTone}${pathStateClass}`}>
          {showHeader ? (
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
          ) : null}
          <div className={`board-card__body${chatOpen ? ' board-card__body--with-mini-chat' : ''}`}>
            {chatOpen ? (
              <div className="board-card__mini-chat">
                <MiniChatPane boardId={boardId} cardId={cardId} onPopout={handleOpenChatModal} />
              </div>
            ) : null}
            {!showHeader && showRefresh ? (
              <div className="board-card__body-actions">
                {refreshDisabled ? (
                  <span className="board-icon-button disabled" aria-label="Refreshing" title="Refreshing">
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
                )}
              </div>
            ) : null}
            <div className="board-card__content">
              <PathStateOverlay pathState={pathState} rationale={pathStateRationale} />
              {children}
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

function CardChromeComponent({ boardId, cardId, chrome = 'full', enableResize = false, children }) {
  if (chrome === 'inspect') {
    return (
      <CardChromeInspectView boardId={boardId} cardId={cardId}>
        {children}
      </CardChromeInspectView>
    );
  }
  return (
    <CardChromeBoardView boardId={boardId} cardId={cardId} enableResize={enableResize} chrome={chrome}>
      {children}
    </CardChromeBoardView>
  );
}

export const CardChrome = memo(CardChromeComponent);
