import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BOARD_TRANSPORT_MODE_SERVER_URL,
  STORAGE_ADAPTER_LOCALSTORAGE,
  clearStoredAppConfigOverride,
  getAppConfig,
  hasStoredAppConfigOverride,
  saveAppConfigOverride,
} from '../lib/appConfig.js';
import { getSampleTemplate, listSampleTemplates } from '../lib/client.js';
import { useManageBoards } from '../hooks/useManageBoards.js';
import { AddBoard } from './board-config/AddBoard.jsx';
import { BoardImportExport } from './board-config/BoardImportExport.jsx';
import { BoardSwitcher } from './board-config/BoardSwitcher.jsx';
import { ConfigSubPane } from './board-config/ConfigSubPane.jsx';
import { EditPageDetails, toPageDetailsDraft } from './board-config/EditPageDetails.jsx';
import { TemplateCardIngest, TemplateIngestPreview } from './board-config/TemplateCardIngest.jsx';
import { ChallengeConfirmModal } from './shared/ChallengeConfirmModal.jsx';
import { FloatingCircularButton } from './shared/FloatingCircularButton.jsx';
import { SmokeRunner } from './test/SmokeRunner.jsx';
import { SmokeStrategist } from './test/SmokeStrategist.jsx';

const RUNTIME_DUMP_VERSION = 1;

const PLUS_ICON_SVG = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 5v14M5 12h14"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

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
    defaultBoardUiTemplate: '',
    refreshAllIntervalMinutes: String(Math.max(1, Math.round(Number(config?.refreshAllIntervalSeconds ?? 0) / 60)) || 30),
    transportMode: config?.transportMode ?? BOARD_TRANSPORT_MODE_SERVER_URL,
    serverOrigin: config?.serverOrigin ?? '',
    storageAdapter: config?.storage?.adapter ?? STORAGE_ADAPTER_LOCALSTORAGE,
  };
}

function metadataFromFormState(formState) {
  return {
    pageTitle: formState.defaultBoardLabel,
    pageSubtitle: formState.defaultBoardSubtitle,
    refreshAllIntervalSeconds: Number(formState.refreshAllIntervalMinutes) * 60,
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
  const [preparingTemplateIngest, setPreparingTemplateIngest] = useState(false);
  const [refreshingWorkspaceBootstrap, setRefreshingWorkspaceBootstrap] = useState(false);
  const [loadingSeedManifest, setLoadingSeedManifest] = useState(false);
  const [seedManifestError, setSeedManifestError] = useState('');
  const [seedManifestEntries, setSeedManifestEntries] = useState([]);
  const [selectedSeedTemplateKey, setSelectedSeedTemplateKey] = useState('');
  const [templateIngestPreview, setTemplateIngestPreview] = useState(null);
  const [addBoardOpen, setAddBoardOpen] = useState(false);
  const [addBoardSubmitting, setAddBoardSubmitting] = useState(false);
  const [addBoardError, setAddBoardError] = useState('');
  const [smokeRunnerOpen, setSmokeRunnerOpen] = useState(false);
  const [smokeStrategistOpen, setSmokeStrategistOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // 'runtime-import' | 'config' | null
  const importFileInputRef = useRef(null);
  const overrideActive = hasStoredAppConfigOverride();
  const serverOriginHasError = serverUnreachable && formState.transportMode === BOARD_TRANSPORT_MODE_SERVER_URL;
  const runtimeAlertBadge = 'Server unreachable';
  const {
    managedBoards: boardOptions,
    loadingManagedBoards: loadingBoardOptions,
    manageBoardsError: boardOptionsError,
    manageBoardsActions,
  } = useManageBoards(formState.serverOrigin, {
    enabled: open && formState.transportMode === BOARD_TRANSPORT_MODE_SERVER_URL,
  });

  const handleAddBoard = useCallback(async (candidate) => {
    setAddBoardSubmitting(true);
    setAddBoardError('');
    try {
      const createdBoard = await manageBoardsActions.addBoard(candidate);
      if (candidate.templateKey) {
        const template = await getSampleTemplate(formState.serverOrigin, candidate.templateKey);
        const payload = template.payload;
        const envelope = normalizeRuntimeDumpEnvelope(payload);
        if (!Array.isArray(envelope?.cards)) {
          throw new Error('Template file must be a JSON array of cards or an object with a cards array');
        }
        await manageBoardsActions.applyImportBoard(candidate.boardId, payload, {
          mode: 'ingest',
          applyBoardMetadata: false,
        });
      }
      setFormState((current) => ({
        ...current,
        defaultBoardId: candidate.boardId,
        defaultBoardLabel: candidate.pageTitle,
        defaultBoardSubtitle: candidate.pageSubtitle,
        defaultBoardUiTemplate: candidate.uiTemplate,
        refreshAllIntervalMinutes: '60',
      }));
      setAddBoardOpen(false);
      return createdBoard;
    } catch (error) {
      setAddBoardError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      setAddBoardSubmitting(false);
    }
  }, [formState.serverOrigin, manageBoardsActions]);

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
    if (!open || formState.transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL) {
      setSeedManifestEntries([]);
      setSelectedSeedTemplateKey('');
      setSeedManifestError('');
      setLoadingSeedManifest(false);
      return undefined;
    }
    let cancelled = false;

    const loadSeedManifest = async () => {
      setLoadingSeedManifest(true);
      setSeedManifestError('');
      try {
        const entries = await listSampleTemplates(formState.serverOrigin);
        if (cancelled) return;
        setSeedManifestEntries(entries);
        setSelectedSeedTemplateKey((current) => {
          if (current && entries.some((entry) => entry.key === current)) return current;
          return entries[0]?.key ?? '';
        });
      } catch (error) {
        if (cancelled) return;
        setSeedManifestEntries([]);
        setSelectedSeedTemplateKey('');
        setSeedManifestError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setLoadingSeedManifest(false);
      }
    };

    void loadSeedManifest();
    return () => { cancelled = true; };
  }, [formState.serverOrigin, formState.transportMode, open]);

  useEffect(() => {
    if (!open) return undefined;
    return undefined;
  }, [formState.serverOrigin, formState.transportMode, open]);

  const updateField = (field) => (event) => {
    const value = event.target.value;
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleBoardSelectionChange = (event) => {
    const nextBoardId = event.target.value;
    setFormState((current) => ({
      ...current,
      defaultBoardId: nextBoardId,
    }));
  };

  useEffect(() => {
    if (!open || !formState.defaultBoardId || formState.transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL) {
      return undefined;
    }

    let cancelled = false;

    const loadSelectedBoard = async () => {
      try {
        const selected = await manageBoardsActions.getBoard(formState.defaultBoardId);
        if (cancelled || !selected) return;
        const nextDraft = toPageDetailsDraft(selected);
        setFormState((current) => {
          if (current.defaultBoardId !== selected.id) {
            return current;
          }
          return {
            ...current,
            defaultBoardLabel: nextDraft.pageTitle,
            defaultBoardSubtitle: nextDraft.pageSubtitle,
            defaultBoardUiTemplate: nextDraft.uiTemplate,
            refreshAllIntervalMinutes: nextDraft.refreshAllIntervalMinutes,
          };
        });
      } catch {
        // The Page Details section surfaces load failures directly.
      }
    };

    void loadSelectedBoard();
    return () => {
      cancelled = true;
    };
  }, [formState.defaultBoardId, formState.transportMode, manageBoardsActions, open]);

  const submitAndReload = useCallback(() => {
    saveAppConfigOverride(normalizeFormState(formState, getAppConfig()));
    window.location.reload();
  }, [formState]);

  const handleSavePageDetails = useCallback(async (selectedBoardId, nextValues) => {
    if (formState.transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL || !selectedBoardId) {
      throw new Error('Select a server-backed board before saving page details.');
    }

    const nextRefreshMinutes = nextValues.refreshAllIntervalMinutes.trim();
    const nextFormState = {
      ...formState,
      defaultBoardLabel: nextValues.pageTitle,
      defaultBoardSubtitle: nextValues.pageSubtitle,
      refreshAllIntervalMinutes: nextRefreshMinutes,
      defaultBoardUiTemplate: nextValues.uiTemplate,
    };

    await manageBoardsActions.saveBoardRecord(selectedBoardId, {
      uiTemplate: nextValues.uiTemplate,
    });
    const savedBoard = await manageBoardsActions.saveBoardMeta(selectedBoardId, metadataFromFormState(nextFormState));
    setFormState(nextFormState);
    return savedBoard;
  }, [formState, manageBoardsActions]);

  const handleReset = () => {
    clearStoredAppConfigOverride();
    window.location.reload();
  };

  const applyRuntimeDumpEnvelope = async (payload, options = {}) => {
    if (!boardId || resettingSeeds) return false;
    const {
      removeMissing = true,
      applyBoardMetadata = true,
    } = options;
    setResettingSeeds(true);
    try {
      const envelope = normalizeRuntimeDumpEnvelope(payload);
      if (!Array.isArray(envelope?.cards)) {
        throw new Error('Runtime dump file must be a JSON array of cards or an object with a cards array');
      }
      await manageBoardsActions.applyImportBoard(boardId, payload, {
        mode: removeMissing ? 'replace' : 'ingest',
        applyBoardMetadata,
      });
      if (applyBoardMetadata && (envelope.label || envelope.subtitle)) {
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

  const handlePrepareTemplateIngest = useCallback(async () => {
    if (!boardId || !selectedSeedTemplateKey || resettingSeeds || preparingTemplateIngest) {
      return;
    }

    setPreparingTemplateIngest(true);
    try {
      const template = await getSampleTemplate(formState.serverOrigin, selectedSeedTemplateKey);
      const payload = template.payload;
      const envelope = normalizeRuntimeDumpEnvelope(payload);
      if (!Array.isArray(envelope?.cards)) {
        throw new Error('Template file must be a JSON array of cards or an object with a cards array');
      }
      const preview = await manageBoardsActions.previewImportBoard(boardId, payload, 'ingest');

      setTemplateIngestPreview({
        templateLabel: template.label || envelope.label || selectedSeedTemplateKey,
        payload,
        cardsToReplace: Array.isArray(preview?.replaceIds) ? preview.replaceIds : [],
        cardsToAdd: Array.isArray(preview?.addIds) ? preview.addIds : [],
        invalidCards: Array.isArray(preview?.invalidCards) ? preview.invalidCards : [],
      });
    } catch (error) {
      console.error('[AppConfigModal] Failed to prepare template ingest', error);
    } finally {
      setPreparingTemplateIngest(false);
    }
  }, [boardId, formState.serverOrigin, preparingTemplateIngest, resettingSeeds, selectedSeedTemplateKey]);

  const handleConfirmTemplateIngest = useCallback(async () => {
    if (!templateIngestPreview?.payload) {
      return;
    }

    const imported = await applyRuntimeDumpEnvelope(templateIngestPreview.payload, {
      removeMissing: false,
      applyBoardMetadata: false,
    });
    if (imported) {
      setTemplateIngestPreview(null);
      window.location.reload();
    }
  }, [applyRuntimeDumpEnvelope, templateIngestPreview]);

  const handleExportRuntimeDump = async () => {
    if (!boardId || savingSeeds) return;
    setSavingSeeds(true);
    try {
      const payload = await manageBoardsActions.exportBoard(boardId);
      downloadJsonFile(`${boardId}-runtime-dump.json`, payload || {
        version: RUNTIME_DUMP_VERSION,
        boardId,
        exportedAt: new Date().toISOString(),
        boardLabel: formState.defaultBoardLabel,
        boardSubtitle: formState.defaultBoardSubtitle,
        cards: [],
      });
    } catch (error) {
      console.error('[AppConfigModal] Failed to export runtime dump', error);
    } finally {
      setSavingSeeds(false);
    }
  };

  const handleRefreshWorkspaceBootstrap = async () => {
    if (!boardId || refreshingWorkspaceBootstrap) return;
    setRefreshingWorkspaceBootstrap(true);
    try {
      await manageBoardsActions.refreshBoard(boardId);
      window.location.reload();
    } catch (error) {
      console.error('[AppConfigModal] Failed to refresh workspace bootstrap', error);
    } finally {
      setRefreshingWorkspaceBootstrap(false);
    }
  };

  const boardSelectOptions = [...boardOptions];
  if (
    formState.defaultBoardId
    && !boardSelectOptions.some((entry) => entry.id === formState.defaultBoardId)
  ) {
    boardSelectOptions.unshift({
      id: formState.defaultBoardId,
      label: formState.defaultBoardId,
    });
  }

  const smokeRunnerEnabled = formState.transportMode === BOARD_TRANSPORT_MODE_SERVER_URL
    && formState.defaultBoardId === 'live-test-frontend';
  const smokeRunnerTitle = smokeRunnerEnabled
    ? 'Run the in-app smoke suite against the live-test-frontend board'
    : 'Smoke suite is only available when the selected board id is live-test-frontend';

  const smokeStrategistEnabled = formState.transportMode === BOARD_TRANSPORT_MODE_SERVER_URL
    && formState.defaultBoardId === 'live-test-journey-frontend';
  const smokeStrategistTitle = smokeStrategistEnabled
    ? 'Run the strategist smoke suite against the live-test-journey-frontend board'
    : 'Strategist smoke suite is only available when the selected board id is live-test-journey-frontend';

  const closeAddBoard = () => {
    if (addBoardSubmitting) return;
    setAddBoardOpen(false);
    setAddBoardError('');
  };

  return (
    <>
      <FloatingCircularButton
        toggled={open}
        icon="bi-gear-fill"
        iconToggled="bi-x-lg"
        onClick={() => {
          setOpenedByAuto(false);
          setOpen(true);
        }}
        onClickToggled={() => {
          setOpenedByAuto(false);
          setOpen(false);
        }}
        className="board-settings-toggle"
        classNameToggled="board-settings-toggle--open"
        title={open ? 'Close board settings' : 'Board settings'}
        aria-label={open ? 'Close board settings' : 'Open board settings'}
        aria-pressed={open}
        data-testid="open-board-settings"
      />

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
            aria-label="Board settings"
          >
            {addBoardOpen ? (
              <ConfigSubPane title="Add board" onBack={closeAddBoard}>
                <AddBoard
                  onClose={closeAddBoard}
                  onSubmit={handleAddBoard}
                  templateOptions={seedManifestEntries}
                  loadingTemplates={loadingSeedManifest}
                  submitting={addBoardSubmitting}
                  errorMessage={addBoardError}
                />
              </ConfigSubPane>
            ) : templateIngestPreview ? (
              <ConfigSubPane title="Ingest Cards from Template" onBack={() => setTemplateIngestPreview(null)}>
                <TemplateIngestPreview
                  templateLabel={templateIngestPreview.templateLabel}
                  cardsToReplace={templateIngestPreview.cardsToReplace}
                  cardsToAdd={templateIngestPreview.cardsToAdd}
                  invalidCards={templateIngestPreview.invalidCards}
                  ingesting={resettingSeeds}
                  onConfirm={() => { void handleConfirmTemplateIngest(); }}
                  onCancel={() => setTemplateIngestPreview(null)}
                />
              </ConfigSubPane>
            ) : (
              <>
            <div className="board-settings-modal__header">
              <BoardSwitcher
                value={formState.defaultBoardId}
                options={boardSelectOptions}
                currentBoardId={boardId}
                onChange={handleBoardSelectionChange}
                onSwitch={submitAndReload}
                selectDisabled={formState.transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL || loadingBoardOptions}
                loading={loadingBoardOptions}
              />
              <button
                type="button"
                className="board-settings-modal__close board-ingest-pane__count board-ingest-pane__count-button d-inline-flex align-items-center justify-content-center align-self-start"
                aria-label="Close board settings"
                onClick={() => {
                  setOpenedByAuto(false);
                  setOpen(false);
                }}
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>

            <div className="board-settings-form">
              <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
                <button
                  type="button"
                  className="btn btn-outline-secondary board-button d-inline-flex align-items-center gap-1"
                  onClick={() => {
                    setAddBoardError('');
                    setAddBoardOpen(true);
                  }}
                  disabled={formState.transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL || loadingBoardOptions}
                  title="New board"
                >
                  {PLUS_ICON_SVG}
                  New Board
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary board-button ms-auto d-inline-flex align-items-center gap-1"
                  onClick={() => setSmokeRunnerOpen(true)}
                  disabled={!smokeRunnerEnabled}
                  title={smokeRunnerTitle}
                  data-testid="board-settings-smoke-test-button"
                >
                  <i className="bi bi-flask" aria-hidden="true" />
                  Run Tests
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary board-button d-inline-flex align-items-center gap-1"
                  onClick={() => setSmokeStrategistOpen(true)}
                  disabled={!smokeStrategistEnabled}
                  title={smokeStrategistTitle}
                  data-testid="board-settings-smoke-strategist-button"
                >
                  <i className="bi bi-compass" aria-hidden="true" />
                  Run Strategist
                </button>
              </div>
              {serverUnreachable ? (
                <div className="board-settings-alert" role="alert" aria-live="assertive">
                  <span className="board-settings-alert__badge">
                    <i className="bi bi-exclamation-triangle-fill" aria-hidden="true" />
                    {runtimeAlertBadge}
                  </span>
                  <span className="board-settings-alert__message">
                    {serverUnreachableMessage || 'Configured server origin is unreachable.'}
                  </span>
                </div>
              ) : null}

              <div className="board-settings-io-section">
                <EditPageDetails
                  boardId={formState.defaultBoardId}
                  transportMode={formState.transportMode}
                  loadBoard={manageBoardsActions.getBoard}
                  onSave={handleSavePageDetails}
                />
              </div>

              <div className="board-settings-io-section">
                <div className="board-settings-io-card d-flex flex-column gap-3">
                  <div className="d-flex align-items-center justify-content-between gap-2">
                    <div className="board-settings-io-card__title">Server</div>
                    <div className="d-flex align-items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        className="btn btn-outline-secondary board-button"
                        onClick={() => setPendingAction('config')}
                      >
                        Reset Server
                      </button>
                    </div>
                  </div>

                  <label className="board-settings-field mb-0">
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

                  {boardOptionsError ? (
                    <div className="board-settings-form__hint text-danger">
                      Board list error: {boardOptionsError}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="board-settings-io-section">
                <BoardImportExport
                  onImport={() => setPendingAction('runtime-import')}
                  onExport={() => { void handleExportRuntimeDump(); }}
                  onRefreshBootstrap={() => { void handleRefreshWorkspaceBootstrap(); }}
                  importing={resettingSeeds}
                  exporting={savingSeeds}
                  refreshing={refreshingWorkspaceBootstrap}
                  disabled={!boardId}
                />

                <TemplateCardIngest
                  entries={seedManifestEntries}
                  selectedKey={selectedSeedTemplateKey}
                  onSelect={setSelectedSeedTemplateKey}
                  onIngest={() => { void handlePrepareTemplateIngest(); }}
                  loading={loadingSeedManifest}
                  ingesting={resettingSeeds}
                  preparing={preparingTemplateIngest}
                  errorMessage={seedManifestError}
                  disabled={!boardId}
                />
              </div>

              <div className="board-settings-form__actions justify-content-end">
                <button type="button" className="btn btn-outline-secondary board-button" onClick={() => setOpen(false)}>Close</button>
              </div>
              {seedManifestError ? (
                <div className="board-settings-form__hint text-danger">
                  Seed board manifest error: {seedManifestError}
                </div>
              ) : null}
            </div>
              </>
            )}
          </section>

          {pendingAction === 'runtime-import' ? (
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
          {smokeRunnerOpen ? (
            <SmokeRunner
              serverOrigin={formState.serverOrigin}
              onClose={() => setSmokeRunnerOpen(false)}
            />
          ) : null}
          {smokeStrategistOpen ? (
            <SmokeStrategist
              serverOrigin={formState.serverOrigin}
              onClose={() => setSmokeStrategistOpen(false)}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}