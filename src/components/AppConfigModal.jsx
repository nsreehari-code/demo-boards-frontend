import React, { useEffect, useRef, useState } from 'react';
import {
  BOARD_TRANSPORT_MODE_INBROWSER,
  BOARD_TRANSPORT_MODE_SERVER_URL,
  STORAGE_ADAPTER_FIRESTORE,
  STORAGE_ADAPTER_LOCALSTORAGE,
  clearStoredAppConfigOverride,
  getAppConfig,
  hasStoredAppConfigOverride,
  saveAppConfigOverride,
} from '../lib/appConfig.js';
import { listRuntimeCards, removeRuntimeCard, upsertRuntimeCard } from '../lib/client.js';
import { ChallengeConfirmModal } from './ChallengeConfirmModal.jsx';

const RUNTIME_DUMP_VERSION = 1;

function normalizeRuntimeDumpCards(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && Array.isArray(payload.cards)) return payload.cards;
  return null;
}

function downloadJsonFile(fileName, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function toFormState(config) {
  return {
    defaultBoardId: config?.defaultBoardId ?? '',
    defaultBoardLabel: config?.defaultBoard?.label ?? '',
    defaultBoardSubtitle: config?.defaultBoard?.subtitle ?? '',
    refreshAllIntervalSeconds: String(config?.refreshAllIntervalSeconds ?? ''),
    transportMode: config?.transportMode ?? BOARD_TRANSPORT_MODE_SERVER_URL,
    serverOrigin: config?.serverOrigin ?? '',
    storageAdapter: config?.storage?.adapter ?? STORAGE_ADAPTER_FIRESTORE,
  };
}

function normalizeFormState(formState, currentConfig) {
  const currentStorage = currentConfig?.storage && typeof currentConfig.storage === 'object'
    ? currentConfig.storage
    : {};
  return {
    defaultBoardId: formState.defaultBoardId,
    defaultBoard: {
      label: formState.defaultBoardLabel,
      subtitle: formState.defaultBoardSubtitle,
    },
    refreshAllIntervalSeconds: Number(formState.refreshAllIntervalSeconds),
    transportMode: formState.transportMode,
    serverOrigin: formState.serverOrigin,
    storage: {
      ...currentStorage,
      adapter: formState.storageAdapter,
    },
  };
}

export function AppConfigModal({ boardId, autoOpen = false, serverUnreachable = false, serverUnreachableMessage = '' }) {
  const [open, setOpen] = useState(false);
  const [openedByAuto, setOpenedByAuto] = useState(false);
  const [formState, setFormState] = useState(() => toFormState(getAppConfig()));
  const [resettingSeeds, setResettingSeeds] = useState(false);
  const [savingSeeds, setSavingSeeds] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // 'reset' | 'save' | null
  const importFileInputRef = useRef(null);
  const overrideActive = hasStoredAppConfigOverride();
  const serverOriginHasError = serverUnreachable && formState.transportMode === BOARD_TRANSPORT_MODE_SERVER_URL;
  const runtimeAlertBadge = formState.transportMode === BOARD_TRANSPORT_MODE_INBROWSER
    ? 'Runtime storage init failed'
    : 'Server unreachable';

  useEffect(() => {
    if (autoOpen) {
      setOpen(true);
      setOpenedByAuto(true);
    }
  }, [autoOpen]);

  useEffect(() => {
    if (!serverUnreachable && openedByAuto) {
      setOpen(false);
      setOpenedByAuto(false);
    }
  }, [openedByAuto, serverUnreachable]);

  useEffect(() => {
    if (!open) return undefined;

    setFormState(toFormState(getAppConfig()));

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const updateField = (field) => (event) => {
    const value = event.target.value;
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    saveAppConfigOverride(normalizeFormState(formState, getAppConfig()));
    window.location.reload();
  };

  const handleReset = () => {
    clearStoredAppConfigOverride();
    window.location.reload();
  };

  const handleImportRuntimeDump = async (file) => {
    if (!boardId || resettingSeeds) return;
    setResettingSeeds(true);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const nextCards = normalizeRuntimeDumpCards(parsed);
      if (!Array.isArray(nextCards)) {
        throw new Error('Runtime dump file must be a JSON array of cards or an object with a cards array');
      }
      const currentCards = await listRuntimeCards(boardId);
      const nextIds = new Set(nextCards.map((card) => String(card?.id || '').trim()).filter(Boolean));
      const currentIds = new Set(currentCards.map((card) => String(card?.id || '').trim()).filter(Boolean));

      for (const card of nextCards) {
        const cardId = typeof card?.id === 'string' ? card.id.trim() : '';
        if (!cardId) throw new Error('Every card in the runtime dump must have a non-empty string id');
        await upsertRuntimeCard(boardId, card);
      }

      for (const cardId of currentIds) {
        if (!nextIds.has(cardId)) {
          await removeRuntimeCard(boardId, cardId);
        }
      }
    } catch (error) {
      console.error('[AppConfigModal] Failed to import runtime dump', error);
    } finally {
      setResettingSeeds(false);
    }
  };

  const handleExportRuntimeDump = async () => {
    if (!boardId || savingSeeds) return;
    setSavingSeeds(true);
    try {
      const cards = await listRuntimeCards(boardId);
      downloadJsonFile(`${boardId}-runtime-dump.json`, {
        version: RUNTIME_DUMP_VERSION,
        boardId,
        exportedAt: new Date().toISOString(),
        cards,
      });
    } catch (error) {
      console.error('[AppConfigModal] Failed to export runtime dump', error);
    } finally {
      setSavingSeeds(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="board-settings-toggle d-inline-flex align-items-center justify-content-center"
        onClick={() => {
          setOpenedByAuto(false);
          setOpen(true);
        }}
        title="Board settings"
        aria-label="Open board settings"
      >
        <i className="bi bi-gear-fill" />
      </button>

      <input
        ref={importFileInputRef}
        type="file"
        accept="application/json,.json"
        className="d-none"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          await handleImportRuntimeDump(file);
        }}
      />

      {open ? (
        <div className="board-settings-layer" role="presentation">
          <button
            type="button"
            className="board-settings-backdrop"
            aria-label="Close board settings"
            onClick={() => {
              setOpenedByAuto(false);
              setOpen(false);
            }}
          />

          <section
            className="board-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="board-settings-title"
          >
            <div className="board-settings-modal__header">
              <div>
                <div className="board-settings-modal__eyebrow">Runtime config</div>
                <h2 id="board-settings-title" className="board-settings-modal__title">Board settings</h2>
              </div>
              <button
                type="button"
                className="board-settings-modal__close board-ingest-pane__count board-ingest-pane__count-button d-inline-flex align-items-center justify-content-center"
                aria-label="Close board settings"
                onClick={() => {
                  setOpenedByAuto(false);
                  setOpen(false);
                }}
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>

            <form className="board-settings-form" onSubmit={handleSubmit}>
              {serverUnreachable ? (
                <div className="board-settings-alert" role="alert" aria-live="assertive">
                  <span className="board-settings-alert__badge">
                    <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />
                    {runtimeAlertBadge}
                  </span>
                  <span className="board-settings-alert__message">
                    {serverUnreachableMessage || (formState.transportMode === BOARD_TRANSPORT_MODE_INBROWSER
                      ? 'The configured runtime storage adapter failed to initialize.'
                      : 'Configured server origin is unreachable.')}
                  </span>
                </div>
              ) : null}

              <label className="board-settings-field">
                <span>Transport mode</span>
                <select className="board-input" value={formState.transportMode} onChange={updateField('transportMode')}>
                  <option value={BOARD_TRANSPORT_MODE_SERVER_URL}>serverUrl</option>
                  <option value={BOARD_TRANSPORT_MODE_INBROWSER}>inbrowser</option>
                </select>
              </label>

              <label className="board-settings-field">
                <span>Storage adapter</span>
                <select
                  className="board-input"
                  value={formState.storageAdapter}
                  onChange={updateField('storageAdapter')}
                  disabled={formState.transportMode !== BOARD_TRANSPORT_MODE_INBROWSER}
                >
                  <option value={STORAGE_ADAPTER_FIRESTORE}>firestore</option>
                  <option value={STORAGE_ADAPTER_LOCALSTORAGE}>localstorage</option>
                </select>
                {formState.transportMode !== BOARD_TRANSPORT_MODE_INBROWSER ? (
                  <div className="board-settings-form__hint">
                    Storage adapter is only used in inbrowser transport mode.
                  </div>
                ) : null}
              </label>

              <label className="board-settings-field">
                <span>Server origin</span>
                <input
                  className={`board-input${serverOriginHasError ? ' board-input--error' : ''}`}
                  type="url"
                  value={formState.serverOrigin}
                  onChange={updateField('serverOrigin')}
                  placeholder="http://localhost:7799"
                  disabled={formState.transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL}
                  aria-invalid={serverOriginHasError ? 'true' : 'false'}
                />
                {formState.transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL ? (
                  <div className="board-settings-form__hint">
                    Server origin is only used in serverUrl mode.
                  </div>
                ) : null}
              </label>

              <label className="board-settings-field">
                <span>Default board id</span>
                <input className="board-input" type="text" value={formState.defaultBoardId} onChange={updateField('defaultBoardId')} placeholder="live" />
              </label>

              <label className="board-settings-field">
                <span>Board label</span>
                <input className="board-input" type="text" value={formState.defaultBoardLabel} onChange={updateField('defaultBoardLabel')} placeholder="Live" />
              </label>

              <label className="board-settings-field">
                <span>Board subtitle</span>
                <input className="board-input" type="text" value={formState.defaultBoardSubtitle} onChange={updateField('defaultBoardSubtitle')} placeholder="Live operational intelligence for agent workflows" />
              </label>

              <label className="board-settings-field">
                <span>Refresh interval (seconds)</span>
                <input className="board-input" type="number" min="1" step="1" value={formState.refreshAllIntervalSeconds} onChange={updateField('refreshAllIntervalSeconds')} placeholder="300" />
              </label>

              <p className="board-settings-form__hint">
                Page title and subtitle now always mirror the board label and subtitle. Save writes a versioned local override and reloads the page so the app boots again with the new config.
                {overrideActive ? ' A stored override is active right now.' : ' No stored override is active right now.'}
              </p>

              <div className="board-settings-form__actions">
                <button
                  type="button"
                  className="btn btn-outline-danger board-button"
                  onClick={() => setPendingAction('reset')}
                  disabled={resettingSeeds || !boardId}
                  title="Import runtime cards from a local JSON file"
                >
                  {resettingSeeds ? 'Importing…' : 'Import Runtime Dump File'}
                </button>
                <button
                  type="button"
                  className="btn btn-outline-warning board-button"
                  onClick={() => { void handleExportRuntimeDump(); }}
                  disabled={savingSeeds || !boardId}
                  title="Download the current runtime cards as a local JSON file"
                >
                  {savingSeeds ? 'Saving…' : 'Save Runtime Dump File'}
                </button>
                <button type="button" className="btn btn-outline-secondary board-button" onClick={() => setOpen(false)}>Cancel</button>
                <button type="button" className="btn btn-outline-secondary board-button" onClick={() => setPendingAction('config')}>Reset to shipped config</button>
                <button type="submit" className="btn btn-primary board-button">Save and reload</button>
              </div>
            </form>
          </section>

          {pendingAction === 'reset' ? (
            <ChallengeConfirmModal
              message="This will overwrite the current runtime card state from a local dump file. Cards not present in the file will be removed."
              onConfirm={() => {
                setPendingAction(null);
                importFileInputRef.current?.click();
              }}
              onCancel={() => setPendingAction(null)}
            />
          ) : null}
          {pendingAction === 'config' ? (
            <ChallengeConfirmModal
              message="This will clear all stored config overrides and reload with the shipped defaults."
              onConfirm={() => { setPendingAction(null); handleReset(); }}
              onCancel={() => setPendingAction(null)}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}