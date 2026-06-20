import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlobalModal } from './GlobalModal.jsx';
import { useBoardState } from '../hooks/useBoardState.js';
import { useCardState } from '../hooks/useCardState.js';
import { useManageBoards } from '../hooks/useManageBoards.js';
import { initBoard, refreshCard, removeRuntimeCard, upsertRuntimeCard } from '../lib/client.js';

// Frontend manual runner for the journey-strategist agentface. This is the
// "other side of the coin" to the backend my-http-test S1 case: same board,
// same always-on backend, same strategist — only the entry layer differs. The
// backend drives the board directly over HTTP and reduces SSE with yaml-flow;
// this component drives the SAME backend through the app's own hooks/client and
// observes the strategist via reduced board state (useCardState/useBoardState),
// exactly as the live StrategistCard does.
//
// Cross-package rule: nothing here imports from the backend (demo-boards). The
// small move-derivation helpers below are a local copy of the backend lib's
// helpers (copy, never cross-reference), matching watchparty-agent-tools.js.

const STRATEGIST_BOARD_ID = 'live-test-journey-frontend';
const STRATEGIST_CARD_ID = 'journey-strategist';
const SEED_CARD_ID = 'card-journey-seed';
const ADMIN_CARD_IDS = new Set(['gandalf-intake', 'journey-strategist', 'card-journey-observatory']);

const STATUS_VALUES = ['advancing', 'waiting', 'aligned'];
const MOVE_VALUES = ['deepen', 'broaden', 'clarify', 'decide', 'reconcile', 'hold'];

const DEFAULT_INTENT = 'Investigate why API p99 latency for the payments service regressed ~40% after the last deploy, concentrated in EU traffic';
const CYCLE_TIMEOUT_MS = 600_000;
const SETTLE_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_500;

// Canonical journey-seed card (copy of sample-card-templates/journey-seed.json
// cards[0]). The frontend cannot read backend disk, and add-board does not
// bootstrap the cardsTemplate seed, so we upsert the seed ourselves.
const SEED_CARD_CONTENT = Object.freeze({
  id: SEED_CARD_ID,
  meta: {
    title: 'Journey Seed',
    tags: ['journey', 'seed', 'intent'],
    desc: 'The origin of an exploration. Describe what you want to investigate in plain language; the Journey Strategist reads this and grows the board from here. Edit the intent any time to steer the journey.',
    presentation: { footprint: 'standard' },
  },
  provides: [{ bindTo: 'nl_intent', ref: 'card_data.intent' }],
  compute: [],
  view: {
    elements: [
      {
        kind: 'notes',
        label: 'What do you want to investigate?',
        data: { bind: 'card_data.intent', writeTo: 'card_data.intent' },
      },
    ],
  },
  card_data: { intent: DEFAULT_INTENT },
});

const SMOKE_CASES = [
  { id: 'MB1', title: 'Ensure journeys board is registered and seeded', mode: 'run' },
  {
    id: 'SC',
    title: 'Move contract (status/verb enums + shape)',
    mode: 'skip',
    reason: 'Move contract is pure-logic and state-independent; validated in backend my-http-test S1.',
  },
  { id: 'SX', title: 'Strategist completes a fresh cycle and surfaces a move', mode: 'run' },
  { id: 'SB', title: "Move's created cards exist on the board and the board is healthy", mode: 'run' },
];

const MODAL_BODY_STYLE = { display: 'grid', gap: '0.9rem' };
const TOOLBAR_STYLE = { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' };
const CASE_ROW_STYLE = {
  border: '1px solid var(--color-border-strong)',
  borderRadius: '0.6rem',
  padding: '0.7rem 0.8rem',
  background: 'var(--color-surface-raised)',
};

// --- local copy of backend move helpers (copy-not-cross-ref) -----------------
function moveFromComputed(cv = {}) {
  const obj = (cv && typeof cv.move === 'object' && cv.move) ? cv.move
    : (cv && typeof cv.plan === 'object' && cv.plan) ? cv.plan
      : {};
  return {
    status: obj.status ?? cv.status_value,
    move: obj.move ?? (typeof cv.move === 'string' ? cv.move : undefined),
    created_cards: obj.created_cards ?? cv.created_table ?? [],
    updated_cards: obj.updated_cards ?? cv.updated_table ?? [],
    rationale: obj.rationale ?? cv.rationale,
    next_candidates: obj.next_candidates ?? cv.next_candidates_list ?? [],
  };
}

function createdCardIds(move) {
  return (Array.isArray(move?.created_cards) ? move.created_cards : [])
    .map((entry) => entry?.card_id)
    .filter(Boolean);
}

function updatedCardIds(move) {
  return (Array.isArray(move?.updated_cards) ? move.updated_cards : [])
    .map((entry) => entry?.card_id)
    .filter(Boolean);
}

function jsonText(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function readStrategistRuntime(board) {
  return board?.cardRuntimes?.[STRATEGIST_CARD_ID] ?? null;
}

function readAttemptCount(board) {
  const runtime = readStrategistRuntime(board);
  return Number(runtime?.runtime?.attempt_count ?? runtime?.attempt_count ?? 0);
}

function summarizeBoard(board) {
  const runtimes = board?.cardRuntimes ?? {};
  const summary = { card_count: 0, completed: 0, failed: 0, running: 0, pending: 0 };
  for (const runtime of Object.values(runtimes)) {
    summary.card_count += 1;
    const status = String(runtime?.status ?? '');
    if (status === 'completed') summary.completed += 1;
    else if (status === 'failed') summary.failed += 1;
    else if (status === 'running' || status === 'in-progress') summary.running += 1;
    else summary.pending += 1;
  }
  return summary;
}

function createInitialCaseState() {
  return SMOKE_CASES.map((entry) => ({
    id: entry.id,
    title: entry.title,
    mode: entry.mode,
    reason: entry.reason ?? '',
    status: 'pending',
    detail: entry.mode === 'skip' ? entry.reason ?? '' : '',
  }));
}

function createLogEntry(caseId, message, kind) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    caseId,
    kind,
    message,
  };
}

export function SmokeStrategist({ serverOrigin, onClose }) {
  const board = useBoardState(STRATEGIST_BOARD_ID);
  // Subscribe to the strategist/seed cards so their reduced state is kept live;
  // the run loop reads the latest snapshot through refs.
  useCardState(STRATEGIST_BOARD_ID, STRATEGIST_CARD_ID);
  useCardState(STRATEGIST_BOARD_ID, SEED_CARD_ID);
  const { manageBoardsActions } = useManageBoards(serverOrigin, { enabled: false });

  const [suiteStatus, setSuiteStatus] = useState('idle');
  const [suiteError, setSuiteError] = useState('');
  const [activeCaseId, setActiveCaseId] = useState('');
  const [caseStates, setCaseStates] = useState(() => createInitialCaseState());
  const [logs, setLogs] = useState([]);
  const [intentText, setIntentText] = useState(DEFAULT_INTENT);
  const [runMode, setRunMode] = useState('continue'); // 'continue' | 'fresh'
  const [latestMove, setLatestMove] = useState(null);
  const [startedAt, setStartedAt] = useState(0);
  const [finishedAt, setFinishedAt] = useState(0);

  const cancelRef = useRef(false);
  const boardRef = useRef(board);
  const runtimeRef = useRef({ move: null, journeyCardIds: [], summary: null });
  const runModeRef = useRef('continue');

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  const appendLog = useCallback((caseId, message, kind = 'info') => {
    const entry = createLogEntry(caseId, message, kind);
    startTransition(() => {
      setLogs((current) => [...current, entry]);
      if (caseId) {
        setCaseStates((current) => current.map((state) => (
          state.id === caseId ? { ...state, detail: message } : state
        )));
      }
    });
  }, []);

  const markCase = useCallback((caseId, patch) => {
    startTransition(() => {
      setCaseStates((current) => current.map((state) => (
        state.id === caseId ? { ...state, ...patch } : state
      )));
    });
  }, []);

  const ensureNotCancelled = useCallback(() => {
    if (cancelRef.current) {
      const error = new Error('Run cancelled');
      error.code = 'CANCELLED';
      throw error;
    }
  }, []);

  const waitUntil = useCallback(async (predicate, timeoutMs, label) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      ensureNotCancelled();
      const result = await predicate();
      if (result) return result;
      await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
    }
    throw new Error(`Timeout (${timeoutMs}ms) waiting for: ${label}`);
  }, [ensureNotCancelled]);

  const ensureBoardRegisteredAndSeeded = useCallback(async () => {
    const log = (message, kind) => appendLog('MB1', message, kind);
    const fresh = runModeRef.current === 'fresh';
    const boards = await manageBoardsActions.listBoards();
    const exists = boards.some((entry) => String(entry?.id ?? '') === STRATEGIST_BOARD_ID);

    if (!exists) {
      log(`registering '${STRATEGIST_BOARD_ID}' (uiTemplate=journeys)`);
      await manageBoardsActions.addBoard({
        boardId: STRATEGIST_BOARD_ID,
        label: 'Live Test Journey (frontend)',
        pageTitle: 'Live Test Journey',
        pageSubtitle: 'Strategist smoke board',
        ai: 'copilot',
        aiWorkspaceTemplate: 'default',
        uiTemplate: 'journeys',
        refsTemplate: 'localfs-default',
      });
    } else {
      log(`reusing existing '${STRATEGIST_BOARD_ID}'`);
    }

    await initBoard(STRATEGIST_BOARD_ID);
    await waitUntil(() => (boardRef.current?.sseClientId ? boardRef.current : false), 15_000, `board SSE payload for ${STRATEGIST_BOARD_ID}`);

    // Fresh mode: clear the board back to its seed (and admin cards) WITHOUT
    // deprecating it. Deprecating the board tears down the runtime out from
    // under the live useBoardState SSE subscription, leaving the UI with a stale
    // snapshot: MB1 still passes because initBoard repopulates cardContents
    // once, but the strategist's subsequent status updates never arrive, so the
    // SX completion gate never fires. Removing the strategist-created cards in
    // place keeps the runtime (and SSE) alive while still forcing the next cycle
    // to do real work (card creation).
    if (fresh && exists) {
      const removable = Object.keys(boardRef.current?.cardContents ?? {})
        .filter((id) => !ADMIN_CARD_IDS.has(id) && id !== SEED_CARD_ID);
      if (removable.length > 0) {
        log(`fresh run: clearing ${removable.length} existing journey card(s) back to the seed`);
        for (const cardId of removable) {
          await removeRuntimeCard(STRATEGIST_BOARD_ID, cardId);
        }
        // Best-effort settle: the removals wake the strategist, which may begin
        // regenerating immediately, so don't fail the run if a card reappears.
        try {
          await waitUntil(() => {
            const present = new Set(Object.keys(boardRef.current?.cardContents ?? {}));
            return removable.every((id) => !present.has(id));
          }, 30_000, 'existing journey cards cleared');
        } catch (error) {
          log(`fresh run: proceeding (board still settling: ${error.message})`, 'warn');
        }
      } else {
        log('fresh run: board already at seed-only state');
      }
    }

    const intent = intentText.trim() || DEFAULT_INTENT;
    log(`upserting ${SEED_CARD_ID} with the test intent`);
    const seedCard = { ...SEED_CARD_CONTENT, card_data: { ...SEED_CARD_CONTENT.card_data, intent } };
    await upsertRuntimeCard(STRATEGIST_BOARD_ID, seedCard);
    await waitUntil(() => Boolean(boardRef.current?.cardContents?.[SEED_CARD_ID]), 30_000, `${SEED_CARD_ID} on board`);
    log(fresh ? 'fresh board reset to seed and intent applied' : 'board registered and seed intent applied');
  }, [appendLog, intentText, manageBoardsActions, waitUntil]);

  const runStrategistCycle = useCallback(async () => {
    const log = (message, kind) => appendLog('SX', message, kind);
    const prevAttempt = readAttemptCount(boardRef.current);

    log(`waking ${STRATEGIST_CARD_ID} (real copilot CLI, may take minutes)`);
    await refreshCard(STRATEGIST_BOARD_ID, STRATEGIST_CARD_ID);

    let sawBusy = false;
    await waitUntil(() => {
      const runtime = readStrategistRuntime(boardRef.current);
      const status = String(runtime?.status ?? '');
      if (status === 'running' || status === 'in-progress') sawBusy = true;
      const attempt = readAttemptCount(boardRef.current);
      // Accept completion only after observing the fresh run go busy. The
      // attempt counter is an additional signal when the backend exposes it.
      return sawBusy && status === 'completed' && attempt >= prevAttempt;
    }, CYCLE_TIMEOUT_MS, `${STRATEGIST_CARD_ID} completes a fresh cycle`);

    // Settle window: the move is published to computed_values slightly ahead of
    // the board materializing the move's last created card (read-after-write
    // lag). Wait until every claimed created/updated id is present.
    let move = moveFromComputed(readStrategistRuntime(boardRef.current)?.computed_values ?? {});
    const claimedIds = [...createdCardIds(move), ...updatedCardIds(move)];
    if (claimedIds.length > 0) {
      try {
        await waitUntil(() => {
          const ids = new Set(Object.keys(boardRef.current?.cardContents ?? {}));
          return claimedIds.every((id) => ids.has(id));
        }, SETTLE_TIMEOUT_MS, 'created/updated cards materialize on the board');
      } catch {
        // Best-effort; SB asserts existence authoritatively.
      }
      move = moveFromComputed(readStrategistRuntime(boardRef.current)?.computed_values ?? {});
    }

    const journeyCardIds = Object.keys(boardRef.current?.cardContents ?? {}).filter((id) => !ADMIN_CARD_IDS.has(id));
    const summary = summarizeBoard(boardRef.current);
    runtimeRef.current = { move, journeyCardIds, summary };
    setLatestMove(move);

    if (!move || (!move.status && !move.move)) {
      throw new Error('strategist completed but no move surfaced in computed_values');
    }
    if (move.status && !STATUS_VALUES.includes(move.status)) {
      throw new Error(`unexpected move.status='${move.status}' (expected one of ${STATUS_VALUES.join(', ')})`);
    }
    if (move.move && !MOVE_VALUES.includes(move.move)) {
      throw new Error(`unexpected move verb='${move.move}' (expected one of ${MOVE_VALUES.join(', ')})`);
    }
    log(`move surfaced: status=${move.status ?? '(n/a)'} move=${move.move ?? '(n/a)'} created=${(move.created_cards || []).length} updated=${(move.updated_cards || []).length}`, 'success');
  }, [appendLog, waitUntil]);

  const assertBehavior = useCallback(async () => {
    const log = (message, kind) => appendLog('SB', message, kind);
    const { move, summary } = runtimeRef.current;
    if (!move) {
      throw new Error('SB requires SX to have produced a move first');
    }
    const ids = new Set(Object.keys(boardRef.current?.cardContents ?? {}));
    const created = Array.isArray(move.created_cards) ? move.created_cards : [];
    const updated = Array.isArray(move.updated_cards) ? move.updated_cards : [];

    for (const card of created) {
      if (!card?.card_id || !ids.has(card.card_id)) {
        throw new Error(`created card '${card?.card_id ?? '(missing id)'}' is not present on the board`);
      }
      if (card.parent && !ids.has(card.parent)) {
        throw new Error(`created card '${card.card_id}' claims parent '${card.parent}' that is not on the board`);
      }
    }
    log(created.length > 0
      ? `${created.length} created card(s) verified present and rooted`
      : 'move created no cards this cycle');

    for (const card of updated) {
      if (!card?.card_id || !ids.has(card.card_id)) {
        throw new Error(`updated card '${card?.card_id ?? '(missing id)'}' is not present on the board`);
      }
    }

    if (move.move === 'hold' && (created.length > 0 || updated.length > 0)) {
      throw new Error('hold move must not create or update cards of its own');
    }

    const failed = Number(summary?.failed ?? summarizeBoard(boardRef.current).failed ?? 0);
    if (failed !== 0) {
      throw new Error(`board left unhealthy: ${failed} failed card(s)`);
    }
    log('board left healthy (no failed cards)', 'success');
  }, [appendLog]);

  const runCase = useCallback(async (caseId) => {
    if (caseId === 'MB1') return ensureBoardRegisteredAndSeeded();
    if (caseId === 'SX') return runStrategistCycle();
    if (caseId === 'SB') return assertBehavior();
    throw new Error(`Unknown strategist smoke case: ${caseId}`);
  }, [assertBehavior, ensureBoardRegisteredAndSeeded, runStrategistCycle]);

  const handleRun = useCallback(async () => {
    if (suiteStatus === 'running') return;
    if (!serverOrigin) {
      setSuiteStatus('failed');
      setSuiteError('Server origin is required for the strategist smoke runner.');
      return;
    }

    cancelRef.current = false;
    runModeRef.current = runMode;
    runtimeRef.current = { move: null, journeyCardIds: [], summary: null };
    setSuiteStatus('running');
    setSuiteError('');
    setActiveCaseId('');
    setCaseStates(createInitialCaseState());
    setLogs([]);
    setLatestMove(null);
    setStartedAt(Date.now());
    setFinishedAt(0);
    appendLog('', `Strategist smoke runner targeting '${STRATEGIST_BOARD_ID}' at ${serverOrigin}`);

    try {
      for (const entry of SMOKE_CASES) {
        ensureNotCancelled();
        setActiveCaseId(entry.id);
        if (entry.mode === 'skip') {
          markCase(entry.id, { status: 'skipped', detail: entry.reason, startedAt: Date.now(), finishedAt: Date.now() });
          appendLog(entry.id, entry.reason, 'warn');
          continue;
        }
        markCase(entry.id, { status: 'running', startedAt: Date.now(), finishedAt: 0, detail: 'Running…' });
        appendLog(entry.id, `Starting ${entry.id}: ${entry.title}`);
        try {
          await runCase(entry.id);
          markCase(entry.id, { status: 'passed', finishedAt: Date.now() });
          appendLog(entry.id, `${entry.id} passed`, 'success');
        } catch (error) {
          if (error?.code === 'CANCELLED') throw error;
          const message = error instanceof Error ? error.message : String(error);
          markCase(entry.id, { status: 'failed', finishedAt: Date.now(), detail: message });
          appendLog(entry.id, message, 'error');
          throw error;
        }
      }
      setSuiteStatus('passed');
    } catch (error) {
      if (error?.code === 'CANCELLED') {
        setSuiteStatus('idle');
        appendLog('', 'Run cancelled', 'warn');
      } else {
        setSuiteStatus('failed');
        setSuiteError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setActiveCaseId('');
      setFinishedAt(Date.now());
    }
  }, [appendLog, ensureNotCancelled, markCase, runCase, runMode, serverOrigin, suiteStatus]);

  const handleStop = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const durationText = startedAt
    ? `${Math.max(0, Math.round(((finishedAt || Date.now()) - startedAt) / 1000))}s`
    : '0s';

  const renderedLogText = useMemo(() => (
    logs.length > 0
      ? logs.map((entry) => `[${new Date(entry.at).toLocaleTimeString()}]${entry.caseId ? ` [${entry.caseId}]` : ''} ${entry.message}`).join('\n')
      : 'No strategist smoke run started yet.'
  ), [logs]);

  return (
    <GlobalModal
      title={`Strategist Smoke Runner: ${STRATEGIST_BOARD_ID}`}
      onClose={() => {
        cancelRef.current = true;
        onClose();
      }}
    >
      <div style={MODAL_BODY_STYLE}>
        <div style={TOOLBAR_STYLE}>
          <button
            type="button"
            className="btn btn-primary board-button"
            onClick={() => { void handleRun(); }}
            disabled={suiteStatus === 'running'}
            data-testid="smoke-strategist-run-button"
          >
            Run
          </button>
          <button
            type="button"
            className="btn btn-outline-secondary board-button"
            onClick={handleStop}
            disabled={suiteStatus !== 'running'}
            data-testid="smoke-strategist-stop-button"
          >
            Stop
          </button>
          <div className="ms-auto global-modal__chip global-modal__chip--active" data-testid="smoke-strategist-suite-status">
            {suiteStatus.toUpperCase()} · {durationText}
          </div>
        </div>

        <div style={{ display: 'grid', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-soft)' }}>Run mode</span>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }} role="radiogroup" aria-label="Run mode">
            {[
              { value: 'continue', label: 'Continue', hint: 'Reuse the existing board (may already be scaffolded)' },
              { value: 'fresh', label: 'Fresh', hint: 'Reset the board back to its seed so the strategist must create cards' },
            ].map((option) => {
              const selected = runMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setRunMode(option.value)}
                  disabled={suiteStatus === 'running'}
                  title={option.hint}
                  data-testid={`smoke-strategist-mode-${option.value}`}
                  className={`global-modal__chip${selected ? ' global-modal__chip--active' : ''}`}
                  style={{
                    cursor: suiteStatus === 'running' ? 'default' : 'pointer',
                    border: '1px solid var(--color-border-strong)',
                    opacity: suiteStatus === 'running' && !selected ? 0.55 : 1,
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-soft)' }}>
            {runMode === 'fresh'
              ? 'Fresh: archives any existing board and registers a clean one, so the first strategist cycle exercises the card-creation path.'
              : 'Continue: reuses the existing board and its current cards; the strategist may choose to hold if the board is already scaffolded.'}
          </div>
        </div>

        <div style={{ display: 'grid', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-soft)' }}>Seed intent</span>
          <textarea
            value={intentText}
            onChange={(event) => setIntentText(event.target.value)}
            disabled={suiteStatus === 'running'}
            rows={2}
            data-testid="smoke-strategist-intent-input"
            style={{
              border: '1px solid var(--color-border-strong)',
              borderRadius: '0.5rem',
              background: 'var(--color-surface-raised)',
              color: 'var(--color-text)',
              padding: '0.5rem 0.65rem',
              fontSize: '0.82rem',
              resize: 'vertical',
            }}
          />
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-soft)' }}>
            The strategist reads this intent from the seed card and grows the board from it. Edit then press Run.
          </div>
        </div>

        {suiteError ? (
          <div className="global-modal__issues-list" style={{ paddingLeft: '1rem' }} data-testid="smoke-strategist-suite-error">
            <div>{suiteError}</div>
          </div>
        ) : null}

        <div className="global-modal__section">
          <div className="global-modal__section-title">Cases</div>
          <div style={{ display: 'grid', gap: '0.55rem' }}>
            {caseStates.map((entry) => {
              const isActive = activeCaseId === entry.id && suiteStatus === 'running';
              return (
                <div
                  key={entry.id}
                  data-testid={`smoke-strategist-case-${entry.id}`}
                  style={{
                    ...CASE_ROW_STYLE,
                    borderColor: isActive
                      ? 'color-mix(in srgb, var(--color-accent-strong) 55%, var(--color-border-strong))'
                      : CASE_ROW_STYLE.border,
                  }}
                >
                  <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--color-text)' }}>{entry.id}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-soft)' }}>{entry.title}</div>
                    </div>
                    <div
                      data-testid={`smoke-strategist-case-status-${entry.id}`}
                      className={[
                        'global-modal__chip',
                        entry.status === 'running' ? 'global-modal__chip--active' : '',
                        entry.status === 'passed' ? 'global-modal__chip--ok' : '',
                        entry.status === 'failed' ? 'global-modal__chip--fail' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      {entry.status}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--color-text-soft)' }}>
                    {entry.detail || entry.reason || 'Waiting to run'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="global-modal__section">
          <div className="global-modal__section-title">Latest move</div>
          <pre
            className="global-modal__pre"
            style={{ margin: 0, maxHeight: '14rem' }}
            data-testid="smoke-strategist-move"
          >{latestMove ? jsonText(latestMove) : 'No move captured yet.'}</pre>
        </div>

        <div className="global-modal__section">
          <div className="global-modal__section-title">Log</div>
          <pre
            className="global-modal__pre"
            style={{ margin: 0, minHeight: '10rem', maxHeight: '18rem' }}
            data-testid="smoke-strategist-log"
          >{renderedLogText}</pre>
        </div>
      </div>
    </GlobalModal>
  );
}
