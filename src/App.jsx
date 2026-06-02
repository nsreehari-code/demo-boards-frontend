import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useBoardState } from './hooks/useBoardState.js';
import { AppConfigModal } from './components/AppConfigModal.jsx';
import {
  BOARD_TRANSPORT_MODE,
  BOARD_TRANSPORT_MODE_SERVER_URL,
  DEFAULT_BOARD_ID,
  PAGE_SUBTITLE,
  PAGE_TITLE,
  REFRESH_ALL_INTERVAL_SECONDS,
} from './lib/appConfig.js';
import { healthz } from './lib/client.js';

const MainBoard = lazy(() => import('./components/MainBoard.jsx').then((module) => ({ default: module.MainBoard })));

const BOARD_ID = DEFAULT_BOARD_ID;
const DEFAULT_THEME = 'mist-ops';
const REFRESH_ALL_INTERVAL_MS = REFRESH_ALL_INTERVAL_SECONDS * 1000;
const HEALTHZ_POLL_INTERVAL_MS = 60_000;
const HEALTHZ_RETRY_INTERVAL_MS = 10_000;
const BOARD_RUNTIME_INIT_STATUS_EVENT = 'demo-board:runtime-init-status';

function getReachabilityMessage(error) {
  if (error instanceof Error && error.message) {
    return `Configured server origin is unreachable: ${error.message}`;
  }

  return 'Configured server origin is unreachable.';
}

function getRuntimeInitFailureMessage(error, usesServerUrlTransport) {
  const prefix = usesServerUrlTransport
    ? 'Board runtime initialization failed'
    : 'Configured runtime storage adapter failed to initialize';
  if (error instanceof Error && error.message) {
    return `${prefix}: ${error.message}`;
  }
  return `${prefix}.`;
}

function formatCountdown(remainingMs) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function RefreshAllButton({ canRefreshAll, refreshAll }) {
  const [nextRefreshAt, setNextRefreshAt] = useState(() => Date.now() + REFRESH_ALL_INTERVAL_MS);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [refreshingAll, setRefreshingAll] = useState(false);
  const refreshAllRef = useRef(null);
  const isMountedRef = useRef(true);
  const timerArmedRef = useRef(false);

  const remainingMs = Math.max(0, nextRefreshAt - nowMs);

  refreshAllRef.current = refreshAll ?? null;

  const resetCountdown = () => {
    const currentTime = Date.now();
    setNowMs(currentTime);
    setNextRefreshAt(currentTime + REFRESH_ALL_INTERVAL_MS);
    timerArmedRef.current = false;
  };

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  useEffect(() => {
    if (refreshingAll) {
      return undefined;
    }

    const timerId = window.setInterval(() => {
      timerArmedRef.current = true;
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [refreshingAll]);

  useEffect(() => {
    if (!timerArmedRef.current || remainingMs > 0 || refreshingAll || !canRefreshAll) {
      return;
    }

    const runRefreshAll = async () => {
      setRefreshingAll(true);
      try {
        window.dispatchEvent(new Event('demo-board:persist-canvas'));
        await refreshAllRef.current?.();
      } finally {
        if (isMountedRef.current) {
          setRefreshingAll(false);
          resetCountdown();
        }
      }
    };

    runRefreshAll();
  }, [canRefreshAll, refreshingAll, remainingMs]);

  const handleRefreshAll = async () => {
    if (refreshingAll) {
      return;
    }

    setRefreshingAll(true);
    try {
      window.dispatchEvent(new Event('demo-board:persist-canvas'));
      await refreshAllRef.current?.();
    } finally {
      setRefreshingAll(false);
      resetCountdown();
    }
  };

  return (
    <button
      type="button"
      className="btn btn-outline-secondary btn-sm board-button d-inline-flex align-items-center gap-2"
      onClick={handleRefreshAll}
      disabled={!canRefreshAll || refreshingAll}
      title="Refresh all cards"
    >
      {refreshingAll ? (
        <span className="spinner-border spinner-border-sm" aria-hidden="true" />
      ) : (
        <i className="bi bi-arrow-clockwise" />
      )}
      <span>{formatCountdown(remainingMs)}</span>
    </button>
  );
}

export default function App() {
  const board = useBoardState(BOARD_ID);
  const canRefreshAll = board?.hasRefreshableCards === true;
  const usesServerUrlTransport = BOARD_TRANSPORT_MODE === BOARD_TRANSPORT_MODE_SERVER_URL;
  const [serverReachability, setServerReachability] = useState({
    checking: usesServerUrlTransport,
    unreachable: false,
    message: '',
  });
  const [runtimeInitFailure, setRuntimeInitFailure] = useState({
    failed: false,
    message: '',
  });

  useEffect(() => {
    const handleRuntimeInitStatus = (event) => {
      const detail = event?.detail ?? {};
      if (detail.boardId !== BOARD_ID) return;
      if (detail.status === 'success') {
        setRuntimeInitFailure({ failed: false, message: '' });
        return;
      }
      if (detail.status === 'error') {
        setRuntimeInitFailure({
          failed: true,
          message: getRuntimeInitFailureMessage(
            detail.message ? new Error(detail.message) : null,
            usesServerUrlTransport,
          ),
        });
      }
    };

    window.addEventListener(BOARD_RUNTIME_INIT_STATUS_EVENT, handleRuntimeInitStatus);
    return () => window.removeEventListener(BOARD_RUNTIME_INIT_STATUS_EVENT, handleRuntimeInitStatus);
  }, [usesServerUrlTransport]);

  useEffect(() => {
    if (!usesServerUrlTransport) {
      setServerReachability({ checking: false, unreachable: false, message: '' });
      return undefined;
    }

    let cancelled = false;
    let timeoutId = null;
    let hasResolvedOnce = false;

    const checkServerReachability = async () => {
      if (!hasResolvedOnce) {
        setServerReachability({ checking: true, unreachable: false, message: '' });
      }

      try {
        const response = await healthz();
        if (!response.ok) {
          throw new Error(`healthz returned ${response.status}`);
        }
        if (!cancelled) {
          hasResolvedOnce = true;
          setServerReachability({ checking: false, unreachable: false, message: '' });
          timeoutId = window.setTimeout(checkServerReachability, HEALTHZ_POLL_INTERVAL_MS);
        }
      } catch (error) {
        if (!cancelled) {
          hasResolvedOnce = true;
          setServerReachability({
            checking: false,
            unreachable: true,
            message: getReachabilityMessage(error),
          });
          timeoutId = window.setTimeout(checkServerReachability, HEALTHZ_RETRY_INTERVAL_MS);
        }
      }
    };

    checkServerReachability();

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [usesServerUrlTransport]);

  const runtimeUnavailable = serverReachability.unreachable || runtimeInitFailure.failed;
  const runtimeUnavailableMessage = serverReachability.unreachable
    ? serverReachability.message
    : runtimeInitFailure.message;

  return (
    <div className="board-app-shell" data-theme={DEFAULT_THEME}>
      <AppConfigModal
        boardId={BOARD_ID}
        autoOpen={runtimeUnavailable}
        serverUnreachable={runtimeUnavailable}
        serverUnreachableMessage={runtimeUnavailableMessage}
      />

      <nav className="board-topbar px-3 px-lg-4 py-1">
        <div className="board-topbar__layout d-flex align-items-center justify-content-between gap-2 flex-nowrap">
          <div className="board-topbar__title-group min-w-0 flex-grow-1 pe-2">
            <div className="board-topbar__brand text-truncate">{PAGE_TITLE}</div>
            <div className="board-topbar__subtitle text-truncate">{PAGE_SUBTITLE}</div>
          </div>
          <div className="board-topbar__actions d-flex align-items-center justify-content-end gap-2 flex-shrink-0 ms-auto">
            <RefreshAllButton
              canRefreshAll={canRefreshAll}
              refreshAll={board?.boardActions?.refreshAll ?? null}
            />
          </div>
        </div>
      </nav>

      <main className="board-main">
        {runtimeUnavailable
          ? null
          : !board
          ? (
            <div className="board-loading">
              <span className="spinner-border spinner-border-sm" role="status" />
              <p className="mb-0">
                {usesServerUrlTransport && serverReachability.checking
                  ? 'Checking configured server origin…'
                  : BOARD_TRANSPORT_MODE === 'inbrowser'
                    ? 'Connecting to in-browser board runtime…'
                    : 'Connecting to live board state…'}
              </p>
            </div>
          )
          : (
            <Suspense
              fallback={(
                <div className="board-loading">
                  <span className="spinner-border spinner-border-sm" role="status" />
                  <p className="mb-0">Loading board workspace…</p>
                </div>
              )}
            >
              <MainBoard boardId={BOARD_ID} />
            </Suspense>
          )}
      </main>
    </div>
  );
}
