import React, { useEffect, useState } from 'react';
import { useCardState } from '../hooks/useCardState.js';
import { callBoardMcp } from '../lib/client.js';
import { CardCore } from './CardCore.jsx';
import { CardBackface } from './CardBackface.jsx';
import { ChatPane } from './ChatPane.jsx';

const CHAT_PROCESSING_PULSE_STYLE = {
  animation: 'card-shell-chat-pulse 0.9s ease-in-out infinite',
  transformOrigin: 'center',
};

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

async function readJsonResponse(response) {
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = typeof payload?.error === 'string'
      ? payload.error
      : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function unwrapMcpToolPayload(payload) {
  if (payload && typeof payload === 'object' && payload.status === 'fail') {
    const message = typeof payload.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : 'MCP tool request failed';
    throw new Error(message);
  }

  if (payload && typeof payload === 'object' && payload.status === 'success' && 'data' in payload) {
    return payload.data;
  }

  return payload;
}

function ChatModal({ boardId, cardId, title, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
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
        <div className="board-modal__body p-0" style={{ height: 'calc(100% - 65px)' }}>
          <ChatPane boardId={boardId} cardId={cardId} />
        </div>
      </div>
    </div>
  );
}

export function CardShell({ boardId, cardId }) {
  const cardState = useCardState(boardId, cardId);
  const [chatOpen, setChatOpen] = useState(false);
  const [showBackface, setShowBackface] = useState(false);
  const [flightStateBySource, setFlightStateBySource] = useState({});
  const [cardFlightState, setCardFlightState] = useState(null);

  useEffect(() => {
    setFlightStateBySource({});
    setCardFlightState(null);
  }, [boardId, cardId]);

  if (!cardState?.cardContent) return null;

  const title = cardState.cardContent.meta?.title ?? cardId;
  const status = cardState.cardRuntime?.status ?? 'fresh';
  const statusTone = getStatusTone(status);
  const refreshDisabled = cardState.cardRuntime?.status === 'running';
  const chatProcessing = cardState.chatState?.processing === true;
  const showRefresh = cardState.canRefresh === true;

  const handleRunFlight = async ({ sourceIndex, bindTo }) => {
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0) {
      return;
    }

    setFlightStateBySource((previous) => ({
      ...previous,
      [sourceIndex]: {
        state: 'running',
        bindTo: bindTo || '',
      },
    }));

    try {
      const payload = unwrapMcpToolPayload(await readJsonResponse(
        await callBoardMcp(boardId, 'preflight.run-single-source-in-live-card', {
          card_id: cardId,
          source_idx: sourceIndex,
          mock_requires: cardState.requiresDataObjects,
        }),
      ));

      setFlightStateBySource((previous) => ({
        ...previous,
        [sourceIndex]: {
          state: 'success',
          bindTo: bindTo || '',
          data: payload && typeof payload === 'object' ? payload : {},
        },
      }));
    } catch (error) {
      setFlightStateBySource((previous) => ({
        ...previous,
        [sourceIndex]: {
          state: 'error',
          bindTo: bindTo || '',
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  };

  const handleRunCardFlight = async () => {
    setCardFlightState({
      state: 'running',
    });

    try {
      const payload = unwrapMcpToolPayload(await readJsonResponse(
        await callBoardMcp(boardId, 'preflight.run-one-cycle-with-candidate-card', {
          candidate_card_content: cardState.cardContent,
          mock_requires: cardState.requiresDataObjects,
        }),
      ));

      setCardFlightState({
        state: 'success',
        data: payload && typeof payload === 'object' ? payload : {},
      });
    } catch (error) {
      setCardFlightState({
        state: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <>
      <style>{`@keyframes card-shell-chat-pulse { 0%, 100% { opacity: 0.35; transform: scale(1); } 50% { opacity: 1; transform: scale(1.24); } }`}</style>
      <div className={`board-card ${statusTone} ${showBackface ? 'board-card--backface' : ''}`}>
        <div className="board-card__header">
          <div className="board-card__title-wrap">
            <div className="board-card__title-block">
              <div className="board-card__title text-truncate">{title}</div>
              <div className="board-card__meta">
                {status !== 'completed' ? <span className={`board-status-pill ${statusTone}`}>{status}</span> : null}
              </div>
            </div>
          </div>
          <div className="board-card__actions">
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
            <button
              type="button"
              className="board-icon-button"
              onClick={() => setShowBackface((previous) => !previous)}
              title={showBackface ? 'Show card content' : 'Show source information'}
              aria-label={showBackface ? 'Show card content' : 'Show source information'}
            >
              {showBackface ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <line x1="12" y1="10" x2="12" y2="16" />
                  <circle cx="12" cy="7" r="1" fill="currentColor" stroke="none" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="board-icon-button"
              onClick={() => setChatOpen(true)}
              title={chatProcessing ? 'Chat processing' : 'Open chat'}
            >
              <i className="bi bi-chat" style={chatProcessing ? CHAT_PROCESSING_PULSE_STYLE : undefined} />
            </button>
          </div>
        </div>
        <div className="board-card__body">
          {showBackface ? (
            <CardBackface
              cardId={cardId}
              title={title}
              cardContent={cardState.cardContent}
              cardFlightState={cardFlightState}
              flightStateBySource={flightStateBySource}
              onRunCardFlight={handleRunCardFlight}
              onRunFlight={handleRunFlight}
            />
          ) : (
            <CardCore boardId={boardId} cardId={cardId} />
          )}
        </div>
      </div>

      {chatOpen ? (
        <ChatModal boardId={boardId} cardId={cardId} title={title} onClose={() => setChatOpen(false)} />
      ) : null}
    </>
  );
}
