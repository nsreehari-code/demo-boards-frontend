import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCardState } from '../../../../hooks/useCardState.js';
import { callBoardMcp } from '../../../../lib/client.js';
import { CardBackface } from './CardBackface.jsx';
import { ChallengeConfirmModal } from '../../../ChallengeConfirmModal.jsx';
import { NodeRenderer } from '../../engine/NodeRenderer.jsx';
import { GlobalModal } from '../../../GlobalModal.jsx';

const DELETE_CARD_SVG = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="inspect-card__trash-icon">
    <path
      fill="currentColor"
      d="M9 3.75a1.5 1.5 0 0 0-1.5 1.5V6H4.75a.75.75 0 0 0 0 1.5h.79l.72 10.13A2.25 2.25 0 0 0 8.5 19.75h7a2.25 2.25 0 0 0 2.24-2.12l.72-10.13h.79a.75.75 0 0 0 0-1.5H16.5v-.75A1.5 1.5 0 0 0 15 3.75H9Zm6 2.25v-.75h-6V6h6Zm-5 3.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0v-5.5a.75.75 0 0 1 .75-.75Zm4 0a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0v-5.5a.75.75 0 0 1 .75-.75Z"
    />
  </svg>
);

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
        This can take 20-30 seconds depending on the fetch path. Results stay in this pane when they arrive.
      </div>
      <div className="global-modal__loading-steps">
        <span className="global-modal__chip global-modal__chip--active">dispatching request</span>
        <span className="global-modal__chip">waiting for remote fetch</span>
        <span className="global-modal__chip">materialising result</span>
      </div>
    </div>
  );
}

function SourceFlightContent({ flightResult }) {
  if (flightResult.status === 'running') {
    return <FlightLoadingContent kind="source" title={flightResult.title} />;
  }

  if (flightResult.error) {
    return <p className="global-modal__issues-list" style={{ listStyle: 'none', padding: 0 }}>{flightResult.error}</p>;
  }

  const data = normalizeSourceFlightData(flightResult.data || {});
  return (
    <>
      <div className="global-modal__chips">
        {data.bindTo ? <span className="global-modal__chip">{data.bindTo}</span> : null}
        <span className={`global-modal__chip global-modal__chip--${data.ok ? 'ok' : 'fail'}`}>{data.ok ? 'ok' : 'failed'}</span>
        {data.issues.length > 0 ? <span className="global-modal__chip global-modal__chip--fail">{data.issues.length} issue{data.issues.length === 1 ? '' : 's'}</span> : null}
      </div>
      {data.issues.length > 0 ? (
        <ul className="global-modal__issues-list">{data.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
      ) : null}
      {data.result !== null ? (
        <div className="global-modal__section">
          <div className="global-modal__section-title">Result</div>
          <pre className="global-modal__pre">{JSON.stringify(data.result, null, 2)}</pre>
        </div>
      ) : null}
    </>
  );
}

function CardFlightContent({ flightResult }) {
  if (flightResult.status === 'running') {
    return <FlightLoadingContent kind="card" title={flightResult.title} />;
  }

  if (flightResult.error) {
    return <p className="global-modal__issues-list" style={{ listStyle: 'none', padding: 0 }}>{flightResult.error}</p>;
  }

  const data = normalizeCardFlightData(flightResult.data || {});
  const providesKeys = Object.keys(data.provides_outputs);
  const elements = Array.isArray(data.rendered_view.elements) ? data.rendered_view.elements : [];

  return (
    <>
      <div className="global-modal__chips">
        {data.cardId ? <span className="global-modal__chip">{data.cardId}</span> : null}
        <span className={`global-modal__chip global-modal__chip--${data.ok ? 'ok' : 'fail'}`}>{data.ok ? 'ok' : 'failed'}</span>
        {data.issues.length > 0 ? <span className="global-modal__chip global-modal__chip--fail">{data.issues.length} issue{data.issues.length === 1 ? '' : 's'}</span> : null}
        {providesKeys.length > 0 ? <span className="global-modal__chip">{providesKeys.length} provide{providesKeys.length === 1 ? '' : 's'}</span> : null}
        {elements.length > 0 ? <span className="global-modal__chip">{elements.length} view element{elements.length === 1 ? '' : 's'}</span> : null}
      </div>
      {data.issues.length > 0 ? (
        <div className="global-modal__section">
          <div className="global-modal__section-title">Issues</div>
          <ul className="global-modal__issues-list">{data.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
        </div>
      ) : null}
      {providesKeys.length > 0 ? (
        <div className="global-modal__section">
          <div className="global-modal__section-title">Provides Outputs</div>
          <pre className="global-modal__pre">{JSON.stringify(data.provides_outputs, null, 2)}</pre>
        </div>
      ) : null}
      {elements.length > 0 ? (
        <div className="global-modal__section">
          <div className="global-modal__section-title">Rendered View</div>
          <pre className="global-modal__pre">{JSON.stringify(data.rendered_view, null, 2)}</pre>
        </div>
      ) : null}
    </>
  );
}

function InspectCardOutput({ flightResult }) {
  if (!flightResult) {
    return (
      <div className="inspect-card__empty-state">
        <div className="inspect-card__empty-title">Trial Run Output</div>
        <div className="inspect-card__empty-copy">
          Run the full card preflight or any source-level preflight from the panel above to inspect the live result here.
        </div>
      </div>
    );
  }

  if (flightResult.kind === 'token') {
    const statusClassName = flightResult.missing ? 'global-modal__chip--fail' : 'global-modal__chip--ok';
    return (
      <div className="inspect-card__output-stack">
        <div className="inspect-card__output-summary">
          <div>
            <div className="inspect-card__pane-label">Selected Token</div>
            <div className="inspect-card__output-title">{flightResult.title}</div>
          </div>
          <span className={`global-modal__chip ${statusClassName}`}>{flightResult.missing ? 'missing' : 'available'}</span>
        </div>
        <div className="inspect-card__output-content">
          <div className="global-modal__chips">
            <span className="global-modal__chip">{flightResult.token}</span>
            <span className="global-modal__chip">{flightResult.tokenKind}</span>
          </div>
          <div className="global-modal__section">
            <div className="global-modal__section-title">Current Data</div>
            <pre className="global-modal__pre">{JSON.stringify(flightResult.data, null, 2)}</pre>
          </div>
        </div>
      </div>
    );
  }

  const statusLabel = flightResult.status === 'running'
    ? 'running'
    : (flightResult.status === 'error' ? 'failed' : 'completed');
  const statusClassName = flightResult.status === 'error'
    ? 'global-modal__chip--fail'
    : (flightResult.status === 'success' ? 'global-modal__chip--ok' : 'global-modal__chip--active');

  return (
    <div className="inspect-card__output-stack">
      <div className="inspect-card__output-summary">
        <div>
          <div className="inspect-card__pane-label">Latest Trial Run</div>
          <div className="inspect-card__output-title">{flightResult.title}</div>
        </div>
        <span className={`global-modal__chip ${statusClassName}`}>{statusLabel}</span>
      </div>
      <div className="inspect-card__output-content">
        {flightResult.kind === 'source' ? (
          <SourceFlightContent flightResult={flightResult} />
        ) : (
          <CardFlightContent flightResult={flightResult} />
        )}
      </div>
    </div>
  );
}

export function InspectCard({ boardId, cardId, title, onClose }) {
  const cardState = useCardState(boardId, cardId);
  const [flightResult, setFlightResult] = useState(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const mountedRef = useRef(true);
  const [theme] = useState(() => (
    typeof document !== 'undefined'
      ? document.querySelector('.board-app-shell[data-theme]')?.getAttribute('data-theme') ?? null
      : null
  ));

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  useEffect(() => {
    setFlightResult(null);
    setDeletePending(false);
    setDeleteConfirmOpen(false);
  }, [boardId, cardId]);

  const activeFlight = flightResult?.status === 'running' ? flightResult : null;
  const flightDisabled = activeFlight !== null;
  const activeTokenKey = flightResult?.kind === 'token' && flightResult?.token
    ? `${flightResult.tokenKind}:${flightResult.token}`
    : '';

  const loadingBySource = useMemo(() => {
    if (activeFlight?.kind !== 'source' || !Number.isInteger(activeFlight.sourceIndex)) {
      return null;
    }
    return { [activeFlight.sourceIndex]: true };
  }, [activeFlight]);

  const handleRunFlight = useCallback(async ({ sourceIndex, bindTo }) => {
    if (flightDisabled || !Number.isInteger(sourceIndex) || sourceIndex < 0) {
      return;
    }

    const label = bindTo || `source ${sourceIndex}`;
    setFlightResult({
      title: `Source flight: ${label}`,
      kind: 'source',
      sourceIndex,
      status: 'running',
    });

    try {
      const payload = await cardState.cardActions.runSingleSourceInLiveCard(sourceIndex, {
        mockRequires: cardState?.requiresDataObjects,
      });

      if (!mountedRef.current) {
        return;
      }

      setFlightResult({
        title: `Source flight: ${label}`,
        kind: 'source',
        sourceIndex,
        status: 'success',
        data: payload && typeof payload === 'object' ? payload : {},
      });
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      setFlightResult({
        title: `Source flight: ${label}`,
        kind: 'source',
        sourceIndex,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [boardId, cardId, cardState?.requiresDataObjects, flightDisabled]);

  const handleRunCardFlight = useCallback(async () => {
    if (flightDisabled || !cardState?.cardContent) {
      return;
    }

    setFlightResult({
      title: `Card flight: ${cardId}`,
      kind: 'card',
      status: 'running',
    });

    try {
      const payload = await cardState.cardActions.runOneCycleWithCandidateCard(cardState.cardContent, {
        mockRequires: cardState.requiresDataObjects,
      });

      if (!mountedRef.current) {
        return;
      }

      setFlightResult({
        title: `Card flight: ${cardId}`,
        kind: 'card',
        status: 'success',
        data: payload && typeof payload === 'object' ? payload : {},
      });
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      setFlightResult({
        title: `Card flight: ${cardId}`,
        kind: 'card',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [cardId, cardState, flightDisabled]);

  const handleInspectToken = useCallback(({ token, kind }) => {
    if (!token || !kind) {
      return;
    }

    const tokenData = kind === 'require'
      ? cardState?.requiresDataObjects?.[token]
      : cardState?.providesDataObjects?.[token];

    setFlightResult({
      title: `${kind === 'require' ? 'Requires' : 'Provides'}: ${token}`,
      kind: 'token',
      token,
      tokenKind: kind,
      missing: tokenData === undefined,
      data: tokenData ?? null,
    });
  }, [cardState?.providesDataObjects, cardState?.requiresDataObjects]);

  const handleDeleteCard = useCallback(async () => {
    if (!boardId || !cardId || deletePending) {
      return;
    }

    setDeletePending(true);
    try {
      const response = await callBoardMcp(boardId, 'manage.remove-card', {
        card_id: cardId,
      });
      if (!response.ok) {
        throw new Error(`manage.remove-card failed with status ${response.status}`);
      }
      if (!mountedRef.current) {
        return;
      }
      setDeleteConfirmOpen(false);
      onClose?.();
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
      setFlightResult({
        title: `Delete card: ${cardId}`,
        kind: 'card',
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
      setDeleteConfirmOpen(false);
    } finally {
      if (mountedRef.current) {
        setDeletePending(false);
      }
    }
  }, [boardId, cardId, deletePending, onClose]);

  if (!cardState?.cardContent) {
    return null;
  }

  return (
    <GlobalModal
      title={`Inspect: ${title}`}
      onClose={onClose}
      className="inspect-card-modal"
      bodyClassName="inspect-card-modal__body"
    >
      <div className="inspect-card">
        <div className="inspect-card__preview-pane">
          <div className="inspect-card__preview-shell">
            <div className="board-flow-node inspect-card__preview-node">
              <div className="board-flow-node__card">
                <div className="board-app-shell inspect-card__preview-theme-scope" data-theme={theme ?? undefined}>
                  <NodeRenderer node={{ kind: 'card:default', spec: { boardId, cardId, chrome: 'inspect' } }} />
                </div>
              </div>
            </div>
          </div>
          <div className="inspect-card__preview-actions">
            <button
              type="button"
              className="inspect-card__trash-button"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deletePending}
              title="Delete this card"
              aria-label="Delete this card"
            >
              {DELETE_CARD_SVG}
              <span>{deletePending ? 'Deleting…' : 'Delete card'}</span>
            </button>
          </div>
        </div>
        <div className="inspect-card__sidebar">
          <div className="inspect-card__sidebar-pane inspect-card__sidebar-pane--top">
            <CardBackface
              cardId={cardId}
              cardContent={cardState.cardContent}
              loadingBySource={loadingBySource}
              cardFlightLoading={activeFlight?.kind === 'card'}
              flightDisabled={flightDisabled}
              activeFlight={activeFlight}
              onRunCardFlight={handleRunCardFlight}
              onRunFlight={handleRunFlight}
              onInspectToken={handleInspectToken}
              activeTokenKey={activeTokenKey}
            />
          </div>
          <div className="inspect-card__sidebar-pane inspect-card__sidebar-pane--bottom">
            <InspectCardOutput flightResult={flightResult} />
          </div>
        </div>
      </div>
      {deleteConfirmOpen ? (
        <ChallengeConfirmModal
          message={`This will remove card ${cardId} from the board runtime.`}
          onConfirm={() => { void handleDeleteCard(); }}
          onCancel={() => {
            if (deletePending) return;
            setDeleteConfirmOpen(false);
          }}
        />
      ) : null}
    </GlobalModal>
  );
}