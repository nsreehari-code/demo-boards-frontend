import React, { useEffect, useState } from 'react';
import { useCardState } from '../hooks/useCardState.js';
import { useBoardFlipState } from '../hooks/useBoardState.js';
import { callBoardMcp } from '../lib/client.js';
import { CardCore } from './CardCore.jsx';
import { CardBackface } from './CardBackface.jsx';
import { ChatPane } from './ChatPane.jsx';
import { GlobalModal } from './GlobalModal.jsx';

const CHAT_PROCESSING_PULSE_STYLE = {
  animation: 'card-shell-chat-pulse 0.9s ease-in-out infinite',
  transformOrigin: 'center',
};

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

function normalizeSourceFlightData(data) {
  if (!data || typeof data !== 'object') {
    return { bindTo: '', ok: false, result: null, issues: [] };
  }
  return {
    bindTo: typeof data.bindTo === 'string' ? data.bindTo : '',
    ok: data.ok !== false,
    result: 'result' in data ? data.result : null,
    issues: Array.isArray(data.issues) ? data.issues : [],
  };
}

function normalizeCardFlightData(data) {
  if (!data || typeof data !== 'object') {
    return { cardId: '', ok: false, issues: [], provides_outputs: {}, rendered_view: { elements: [] } };
  }
  return {
    cardId: typeof data.cardId === 'string' ? data.cardId : '',
    ok: data.ok !== false,
    issues: Array.isArray(data.issues) ? data.issues : [],
    provides_outputs: data.provides_outputs && typeof data.provides_outputs === 'object' ? data.provides_outputs : {},
    rendered_view: data.rendered_view && typeof data.rendered_view === 'object' ? data.rendered_view : { elements: [] },
  };
}

function FlightLoadingContent({ kind, title }) {
  const label = kind === 'card' ? 'card preflight' : 'source preflight';

  return (
    <div className="global-modal__loading" role="status" aria-live="polite">
      <div className="global-modal__loading-hero">
        <span className="spinner-border" aria-hidden="true" />
        <div>
          <div className="global-modal__section-title">Running {label}</div>
          <div className="global-modal__loading-title">{title}</div>
        </div>
      </div>
      <div className="global-modal__loading-copy">
        This can take 20-30 seconds depending on the fetch path. The modal stays open and updates in place when results arrive.
      </div>
      <div className="global-modal__loading-steps">
        <span className="global-modal__chip global-modal__chip--active">dispatching request</span>
        <span className="global-modal__chip">waiting for remote fetch</span>
        <span className="global-modal__chip">materialising result</span>
      </div>
    </div>
  );
}

function SourceFlightModalContent({ flightResult }) {
  if (flightResult.status === 'running') {
    return <FlightLoadingContent kind="source" title={flightResult.title} />;
  }

  if (flightResult.error) {
    return <p className="global-modal__issues-list" style={{ listStyle: 'none', padding: 0 }}>{flightResult.error}</p>;
  }
  const d = normalizeSourceFlightData(flightResult.data || {});
  return (
    <>
      <div className="global-modal__chips">
        {d.bindTo ? <span className="global-modal__chip">{d.bindTo}</span> : null}
        <span className={`global-modal__chip global-modal__chip--${d.ok ? 'ok' : 'fail'}`}>{d.ok ? 'ok' : 'failed'}</span>
        {d.issues.length > 0 ? <span className="global-modal__chip global-modal__chip--fail">{d.issues.length} issue{d.issues.length === 1 ? '' : 's'}</span> : null}
      </div>
      {d.issues.length > 0 ? (
        <ul className="global-modal__issues-list">{d.issues.map((iss, i) => <li key={i}>{iss}</li>)}</ul>
      ) : null}
      {d.result !== null ? (
        <div className="global-modal__section">
          <div className="global-modal__section-title">Result</div>
          <pre className="global-modal__pre">{JSON.stringify(d.result, null, 2)}</pre>
        </div>
      ) : null}
    </>
  );
}

function CardFlightModalContent({ flightResult }) {
  if (flightResult.status === 'running') {
    return <FlightLoadingContent kind="card" title={flightResult.title} />;
  }

  if (flightResult.error) {
    return <p className="global-modal__issues-list" style={{ listStyle: 'none', padding: 0 }}>{flightResult.error}</p>;
  }
  const d = normalizeCardFlightData(flightResult.data || {});
  const providesKeys = Object.keys(d.provides_outputs);
  const elements = Array.isArray(d.rendered_view.elements) ? d.rendered_view.elements : [];
  return (
    <>
      <div className="global-modal__chips">
        {d.cardId ? <span className="global-modal__chip">{d.cardId}</span> : null}
        <span className={`global-modal__chip global-modal__chip--${d.ok ? 'ok' : 'fail'}`}>{d.ok ? 'ok' : 'failed'}</span>
        {d.issues.length > 0 ? <span className="global-modal__chip global-modal__chip--fail">{d.issues.length} issue{d.issues.length === 1 ? '' : 's'}</span> : null}
        {providesKeys.length > 0 ? <span className="global-modal__chip">{providesKeys.length} provide{providesKeys.length === 1 ? '' : 's'}</span> : null}
        {elements.length > 0 ? <span className="global-modal__chip">{elements.length} view element{elements.length === 1 ? '' : 's'}</span> : null}
      </div>
      {d.issues.length > 0 ? (
        <div className="global-modal__section">
          <div className="global-modal__section-title">Issues</div>
          <ul className="global-modal__issues-list">{d.issues.map((iss, i) => <li key={i}>{iss}</li>)}</ul>
        </div>
      ) : null}
      {providesKeys.length > 0 ? (
        <div className="global-modal__section">
          <div className="global-modal__section-title">Provides Outputs</div>
          <pre className="global-modal__pre">{JSON.stringify(d.provides_outputs, null, 2)}</pre>
        </div>
      ) : null}
      {elements.length > 0 ? (
        <div className="global-modal__section">
          <div className="global-modal__section-title">Rendered View</div>
          <pre className="global-modal__pre">{JSON.stringify(d.rendered_view, null, 2)}</pre>
        </div>
      ) : null}
    </>
  );
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

export function CardShell({ boardId, cardId }) {
  const cardState = useCardState(boardId, cardId);
  const { flippedCardId, setFlippedCardId } = useBoardFlipState(boardId);
  const [chatOpen, setChatOpen] = useState(false);
  const [sourceLoadingSet, setSourceLoadingSet] = useState(new Set());
  const [cardFlightLoading, setCardFlightLoading] = useState(false);
  const [flightModal, setFlightModal] = useState(null);

  useEffect(() => {
    setSourceLoadingSet(new Set());
    setCardFlightLoading(false);
    setFlightModal(null);
  }, [boardId, cardId]);

  if (!cardState?.cardContent) return null;

  const title = cardState.cardContent.meta?.title ?? cardId;
  const status = cardState.cardRuntime?.status ?? 'fresh';
  const statusTone = getStatusTone(status);
  const showBackface = flippedCardId === cardId;
  const refreshDisabled = cardState.cardRuntime?.status === 'running';
  const chatProcessing = cardState.chatState?.processing === true;
  const showRefresh = cardState.canRefresh === true;

  const loadingBySource = Object.fromEntries([...sourceLoadingSet].map((idx) => [idx, true]));

  const handleRunFlight = async ({ sourceIndex, bindTo }) => {
    if (!Number.isInteger(sourceIndex) || sourceIndex < 0) {
      return;
    }
    setSourceLoadingSet((prev) => new Set([...prev, sourceIndex]));
    const label = bindTo || `source ${sourceIndex}`;
    setFlightModal({
      title: `Source flight: ${label}`,
      kind: 'source',
      status: 'running',
    });
    try {
      const payload = unwrapMcpToolPayload(await readJsonResponse(
        await callBoardMcp(boardId, 'preflight.run-single-source-in-live-card', {
          card_id: cardId,
          source_idx: sourceIndex,
          mock_requires: cardState.requiresDataObjects,
        }),
      ));
      setFlightModal({
        title: `Source flight: ${label}`,
        kind: 'source',
        status: 'success',
        data: payload && typeof payload === 'object' ? payload : {},
      });
    } catch (error) {
      setFlightModal({
        title: `Source flight: ${label}`,
        kind: 'source',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSourceLoadingSet((prev) => { const next = new Set(prev); next.delete(sourceIndex); return next; });
    }
  };

  const handleRunCardFlight = async () => {
    setCardFlightLoading(true);
    setFlightModal({
      title: `Card flight: ${cardId}`,
      kind: 'card',
      status: 'running',
    });
    try {
      const payload = unwrapMcpToolPayload(await readJsonResponse(
        await callBoardMcp(boardId, 'preflight.run-one-cycle-with-candidate-card', {
          candidate_card_content: cardState.cardContent,
          mock_requires: cardState.requiresDataObjects,
        }),
      ));
      setFlightModal({
        title: `Card flight: ${cardId}`,
        kind: 'card',
        status: 'success',
        data: payload && typeof payload === 'object' ? payload : {},
      });
    } catch (error) {
      setFlightModal({
        title: `Card flight: ${cardId}`,
        kind: 'card',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setCardFlightLoading(false);
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
            {showBackface ? (
              <button
                type="button"
                className="board-icon-button"
                onClick={() => setFlippedCardId(null)}
                title="Show card content"
                aria-label="Show card content"
              >
                {CLOSE_DETAILS_SVG}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="board-icon-button"
                  onClick={() => setFlippedCardId(cardId)}
                  title="Show source information"
                  aria-label="Show source information"
                >
                  <i className="bi bi-sliders2" aria-hidden="true" style={{ fontSize: '0.95rem' }} />
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
                <button
                  type="button"
                  className="board-icon-button"
                  onClick={() => setChatOpen(true)}
                  title={chatProcessing ? 'Chat processing' : 'Open chat'}
                >
                  <i className="bi bi-chat" style={chatProcessing ? CHAT_PROCESSING_PULSE_STYLE : undefined} />
                </button>
              </>
            )}
          </div>
        </div>
        <div className="board-card__body">
          {showBackface ? (
            <CardBackface
              cardId={cardId}
              cardContent={cardState.cardContent}
              loadingBySource={loadingBySource}
              cardFlightLoading={cardFlightLoading}
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
      {flightModal ? (
        <GlobalModal title={flightModal.title} onClose={() => setFlightModal(null)}>
          {flightModal.kind === 'source' ? (
            <SourceFlightModalContent flightResult={flightModal} />
          ) : (
            <CardFlightModalContent flightResult={flightModal} />
          )}
        </GlobalModal>
      ) : null}
    </>
  );
}
