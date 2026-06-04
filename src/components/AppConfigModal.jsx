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
const SEED_BOARDS_MANIFEST_URL = '/assets/seed-boards/index.json';

function normalizeRuntimeDumpEnvelope(payload) {
  if (Array.isArray(payload)) {
    return { label: '', subtitle: '', cards: payload };
  }
  if (payload && typeof payload === 'object' && Array.isArray(payload.cards)) {
    return {
      label: typeof payload.boardLabel === 'string' ? payload.boardLabel.trim() : '',
      subtitle: typeof payload.boardSubtitle === 'string' ? payload.boardSubtitle.trim() : '',
      cards: payload.cards,
    };
  }
  return null;
}

function normalizeSeedManifestEntries(payload) {
  const entries = Array.isArray(payload)
    ? payload
    : (payload && typeof payload === 'object' && Array.isArray(payload.entries) ? payload.entries : []);
  return entries
    .map((entry) => {
      const fileName = typeof entry?.fileName === 'string' ? entry.fileName.trim() : '';
      const label = typeof entry?.label === 'string' ? entry.label.trim() : '';
      if (!fileName || !label) return null;
      return {
        fileName,
        label,
        description: typeof entry?.description === 'string' ? entry.description.trim() : '',
      };
    })
    .filter(Boolean);
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
    refreshAllIntervalMinutes: String(Math.max(1, Math.round(Number(config?.refreshAllIntervalSeconds ?? 0) / 60)) || 30),
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
    refreshAllIntervalSeconds: Number(formState.refreshAllIntervalMinutes) * 60,
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
  const [loadingSeedManifest, setLoadingSeedManifest] = useState(false);
  const [seedManifestError, setSeedManifestError] = useState('');
  const [seedManifestEntries, setSeedManifestEntries] = useState([]);
  const [selectedSeedFileName, setSelectedSeedFileName] = useState('');
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

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;

    const loadSeedManifest = async () => {
      setLoadingSeedManifest(true);
      setSeedManifestError('');
      try {
        const response = await fetch(SEED_BOARDS_MANIFEST_URL, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to load seed manifest: ${response.status}`);
        }
        const payload = await response.json();
        const entries = normalizeSeedManifestEntries(payload);
        if (cancelled) return;
        setSeedManifestEntries(entries);
        setSelectedSeedFileName((current) => {
          if (current && entries.some((entry) => entry.fileName === current)) return current;
          return entries[0]?.fileName ?? '';
        });
      } catch (error) {
        if (cancelled) return;
        setSeedManifestEntries([]);
        setSelectedSeedFileName('');
        setSeedManifestError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setLoadingSeedManifest(false);
      }
    };

    void loadSeedManifest();
    return () => { cancelled = true; };
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

  const applyRuntimeDumpEnvelope = async (payload) => {
    if (!boardId || resettingSeeds) return false;
    setResettingSeeds(true);
    try {
      const envelope = normalizeRuntimeDumpEnvelope(payload);
      if (!Array.isArray(envelope?.cards)) {
        throw new Error('Runtime dump file must be a JSON array of cards or an object with a cards array');
      }
      const nextCards = envelope.cards;
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
      if (envelope.label || envelope.subtitle) {
        setFormState((current) => ({
          ...current,
          ...(envelope.label ? { defaultBoardLabel: envelope.label } : {}),
          ...(envelope.subtitle ? { defaultBoardSubtitle: envelope.subtitle } : {}),
        }));
      }
      return true;
    } catch (error) {
      console.error('[AppConfigModal] Failed to import runtime dump', error);
      return false;
    } finally {
      setResettingSeeds(false);
    }
  };

  const handleImportRuntimeDump = async (file) => {
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    const imported = await applyRuntimeDumpEnvelope(parsed);
    if (imported) {
      window.location.reload();
    }
  };

  const handleImportSeedBoard = async () => {
    if (!selectedSeedFileName || resettingSeeds) return;
    const response = await fetch(`/assets/seed-boards/${encodeURIComponent(selectedSeedFileName)}`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load seed board ${selectedSeedFileName}: ${response.status}`);
    }
    const payload = await response.json();
    const imported = await applyRuntimeDumpEnvelope(payload);
    if (imported) {
      window.location.reload();
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
        boardLabel: formState.defaultBoardLabel,
        boardSubtitle: formState.defaultBoardSubtitle,
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

              {false ? (
                <>
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
                </>
              ) : null}

              <div className="row g-3 align-items-start">
                <div className="col">
                  <label className="board-settings-field mb-3">
                    <span>Server</span>
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

                  <label className="board-settings-field mb-0">
                    <span>Board Id</span>
                    <input className="board-input" type="text" value={formState.defaultBoardId} onChange={updateField('defaultBoardId')} placeholder="live" />
                  </label>
                </div>

                <div className="col-auto d-flex align-items-start pt-4">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm board-button"
                    onClick={() => setPendingAction('config')}
                  >
                    Reset Server / Board
                  </button>
                </div>
              </div>

              <label className="board-settings-field">
                <span>Page Title</span>
                <input className="board-input" type="text" value={formState.defaultBoardLabel} onChange={updateField('defaultBoardLabel')} placeholder="Live" />
              </label>

              <label className="board-settings-field">
                <span>Page Subtitle</span>
                <input className="board-input" type="text" value={formState.defaultBoardSubtitle} onChange={updateField('defaultBoardSubtitle')} placeholder="Live operational intelligence for agent workflows" />
              </label>

              <label className="board-settings-field">
                <span>Refresh Interval (minutes)</span>
                <input className="board-input" type="number" min="1" step="1" value={formState.refreshAllIntervalMinutes} onChange={updateField('refreshAllIntervalMinutes')} placeholder="30" />
              </label>

              <div className="board-settings-io-section">
                <div className="board-settings-io-card d-flex flex-column gap-3">
                  <div className="board-settings-io-card__title">Board Import / Export</div>

                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      className="btn btn-outline-secondary board-button"
                      onClick={() => setPendingAction('reset')}
                      disabled={resettingSeeds || !boardId}
                      title="Import board from a local JSON file"
                    >
                      {resettingSeeds ? 'Importing…' : 'Import Board'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary board-button"
                      onClick={() => { void handleExportRuntimeDump(); }}
                      disabled={savingSeeds || !boardId}
                      title="Export the current board as a local JSON file"
                    >
                      {savingSeeds ? 'Saving…' : 'Export Board'}
                    </button>
                  </div>

                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <select
                      className="board-input board-settings-sample-select"
                      value={selectedSeedFileName}
                      onChange={(event) => setSelectedSeedFileName(event.target.value)}
                      disabled={loadingSeedManifest || resettingSeeds || seedManifestEntries.length === 0}
                      title={seedManifestError || 'Select a bundled sample board file'}
                    >
                      {seedManifestEntries.length === 0 ? (
                        <option value="">{loadingSeedManifest ? 'Loading seed boards…' : 'No seed boards available'}</option>
                      ) : null}
                      {seedManifestEntries.map((entry) => (
                        <option key={entry.fileName} value={entry.fileName}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-outline-secondary board-button"
                      onClick={() => setPendingAction('seed-import')}
                      disabled={resettingSeeds || !boardId || !selectedSeedFileName || loadingSeedManifest || seedManifestEntries.length === 0}
                      title="Import the selected sample board"
                    >
                      {resettingSeeds ? 'Importing…' : 'Import Sample'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="board-settings-form__actions justify-content-end">
                <button type="button" className="btn btn-outline-secondary board-button" onClick={() => setOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary board-button">Save and reload</button>
              </div>
              {seedManifestError ? (
                <div className="board-settings-form__hint text-danger">
                  Seed board manifest error: {seedManifestError}
                </div>
              ) : null}
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
          {pendingAction === 'seed-import' ? (
            <ChallengeConfirmModal
              message="This will overwrite the current runtime card state from the selected bundled seed board file. Cards not present in that file will be removed."
              onConfirm={() => {
                setPendingAction(null);
                void handleImportSeedBoard().catch((error) => {
                  console.error('[AppConfigModal] Failed to import seed board', error);
                });
              }}
              onCancel={() => setPendingAction(null)}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}