import React, { memo, useCallback, useEffect, useRef } from 'react';
import { useCardWidthState } from '../hooks/useCoordsState.jsx';
import { useCardState } from '../hooks/useCardState.js';
import { CardCore } from './CardCore.jsx';

const MIN_CARD_WIDTH = 280;
const MAX_CARD_WIDTH = 960;

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

function ResizableStrategistCardShell({ cardId, className = '', enabled = false, children }) {
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

function StrategistCardComponent({ boardId, cardId, enableResize = false }) {
  const cardState = useCardState(boardId, cardId);

  if (!cardState?.cardContent) return null;

  const title = cardState.cardContent.meta?.title ?? cardId;
  const status = cardState.cardRuntime?.status ?? 'fresh';
  const statusTone = getStatusTone(status);
  const pathState = normalizePathState(cardState.cardContent.meta);
  const pathStateRationale = normalizePathStateRationale(cardState.cardContent.meta);
  const pathStateClass = pathState ? ` board-card--path-${pathState}` : '';
  const refreshDisabled = cardState.cardRuntime?.status === 'running';
  const showRefresh = cardState.canRefresh === true;

  return (
    <ResizableStrategistCardShell cardId={cardId} enabled={enableResize}>
      <div className={`board-card ${statusTone}${pathStateClass}`}>
        <div
          className="board-card__header d-none"
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
        </div>
        <div className="board-card__body">
          {showRefresh ? (
            <div className="board-card__body-actions">
              {refreshDisabled ? (
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
              )}
            </div>
          ) : null}
          <div className="board-card__content">
            <PathStateOverlay pathState={pathState} rationale={pathStateRationale} />
            <CardCore boardId={boardId} cardId={cardId} />
          </div>
        </div>
      </div>
    </ResizableStrategistCardShell>
  );
}

export const StrategistCard = memo(StrategistCardComponent);