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
import { useBoardConfig } from '../hooks/useBoardConfig.js';
import { DEFAULT_THEME_PACK_ID, THEME_PACK_IDS, resolveThemePackIdFromUi, withResolvedThemePackId } from '../lib/themePacks.js';
import { useManageBoards } from '../hooks/useManageBoards.js';
import { useBoardVisuals } from '../hooks/useBoardVisuals.js';
import { AddBoard } from './board-config/AddBoard.jsx';
import { BoardConfigButton } from './board-config/BoardConfigButton.jsx';
import { BoardImportExport } from './board-config/BoardImportExport.jsx';
import { BoardSwitcher } from './board-config/BoardSwitcher.jsx';
import { ConfigSubPane } from './board-config/ConfigSubPane.jsx';
import { EditPageDetails, toPageDetailsDraft } from './board-config/EditPageDetails.jsx';
import { TemplateCardIngest, TemplateIngestPreview } from './board-config/TemplateCardIngest.jsx';
import { ChallengeConfirmModal } from './shared/ChallengeConfirmModal.jsx';
import { PanelVertical } from './shared/PanelVertical.jsx';
import { FileUpload } from './shared/FileUpload.jsx';
import { SmokeRunner } from './test/SmokeRunner.jsx';
import { SmokeStrategist } from './test/SmokeStrategist.jsx';

const RUNTIME_DUMP_VERSION = 1;

const LAYOUT_KIND_CANVAS = 'infinite-canvas';
const LAYOUT_KIND_CARDS = 'flowing-cards';

function normalizeLayoutKind(kind) {
  return kind === LAYOUT_KIND_CARDS ? LAYOUT_KIND_CARDS : LAYOUT_KIND_CANVAS;
}

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

export function BoardConfigPanel({ boardId, autoOpen = false, serverUnreachable = false, serverUnreachableMessage = '' }) {
  const { config: activeBoardConfig } = useBoardConfig(boardId);
  const { visuals: activeBoardVisuals } = useBoardVisuals(boardId);
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
  const [layoutKind, setLayoutKind] = useState(null);
  const [togglingLayout, setTogglingLayout] = useState(false);
  const [themePackId, setThemePackId] = useState(null);
  const [togglingTheme, setTogglingTheme] = useState(false);
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

    if (formState.defaultBoardId === boardId && activeBoardConfig) {
      const nextDraft = toPageDetailsDraft({
        id: boardId,
        metadata: activeBoardConfig.metadata,
        rawBoard: activeBoardConfig.board,
      });
      setFormState((current) => {
        if (current.defaultBoardId !== boardId) {
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
      return undefined;
    }

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
  }, [activeBoardConfig, boardId, formState.defaultBoardId, formState.transportMode, manageBoardsActions, open]);

  useEffect(() => {
    if (!open || !formState.defaultBoardId || formState.transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL) {
      setLayoutKind(null);
      return undefined;
    }

    if (formState.defaultBoardId === boardId) {
      setLayoutKind(normalizeLayoutKind(activeBoardVisuals.layoutBlob?.kind));
      return undefined;
    }

    let cancelled = false;

    const loadLayoutKind = async () => {
      try {
        const layout = await manageBoardsActions.getLayout(formState.defaultBoardId);
        if (cancelled) return;
        setLayoutKind(normalizeLayoutKind(layout?.kind));
      } catch {
        if (!cancelled) setLayoutKind(null);
      }
    };

    void loadLayoutKind();
    return () => {
      cancelled = true;
    };
  }, [activeBoardVisuals.layoutBlob?.kind, boardId, formState.defaultBoardId, formState.transportMode, manageBoardsActions, open]);

  useEffect(() => {
    if (!open || !formState.defaultBoardId || formState.transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL) {
      setThemePackId(null);
      return undefined;
    }

    if (formState.defaultBoardId === boardId) {
      setThemePackId(activeBoardVisuals.theme);
      return undefined;
    }

    let cancelled = false;

    const loadTheme = async () => {
      try {
        const board = await manageBoardsActions.getBoard(formState.defaultBoardId);
        if (cancelled) return;
        setThemePackId(resolveThemePackIdFromUi(board?.ui));
      } catch {
        if (!cancelled) setThemePackId(null);
      }
    };

    void loadTheme();
    return () => {
      cancelled = true;
    };
  }, [activeBoardVisuals.theme, boardId, formState.defaultBoardId, formState.transportMode, manageBoardsActions, open]);

  const handleToggleLayout = useCallback(async () => {
    if (
      formState.transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL
      || !formState.defaultBoardId
      || togglingLayout
    ) {
      return;
    }
    const nextKind = layoutKind === LAYOUT_KIND_CARDS ? LAYOUT_KIND_CANVAS : LAYOUT_KIND_CARDS;
    setTogglingLayout(true);
    try {
      await manageBoardsActions.shallowMergeLayout(formState.defaultBoardId, 'kind', nextKind);
      setLayoutKind(nextKind);
      if (formState.defaultBoardId === boardId) {
        window.location.reload();
      }
    } catch (error) {
      console.error('[BoardConfigPanel] Failed to toggle layout', error);
    } finally {
      setTogglingLayout(false);
    }
  }, [boardId, formState.defaultBoardId, formState.transportMode, layoutKind, manageBoardsActions, togglingLayout]);

  const handleToggleTheme = useCallback(async () => {
    if (
      formState.transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL
      || !formState.defaultBoardId
      || togglingTheme
    ) {
      return;
    }
    const currentIndex = THEME_PACK_IDS.indexOf(themePackId ?? DEFAULT_THEME_PACK_ID);
    const nextThemeId = THEME_PACK_IDS[(currentIndex + 1) % THEME_PACK_IDS.length];
    setTogglingTheme(true);
    try {
      const currentBoard = await manageBoardsActions.getBoard(formState.defaultBoardId);
      const nextRecord = {
        ...(currentBoard?.rawBoard && typeof currentBoard.rawBoard === 'object' ? currentBoard.rawBoard : {}),
        ui: withResolvedThemePackId(currentBoard?.ui, nextThemeId),
      };
      await manageBoardsActions.saveBoardRecord(formState.defaultBoardId, nextRecord);
      setThemePackId(nextThemeId);
      if (formState.defaultBoardId === boardId) {
        window.location.reload();
      }
    } catch (error) {
      console.error('[BoardConfigPanel] Failed to toggle theme', error);
    } finally {
      setTogglingTheme(false);
    }
  }, [boardId, formState.defaultBoardId, formState.transportMode, themePackId, manageBoardsActions, togglingTheme]);

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

    const currentBoard = await manageBoardsActions.getBoard(selectedBoardId);
    const nextRecord = {
      ...(currentBoard?.rawBoard && typeof currentBoard.rawBoard === 'object' ? currentBoard.rawBoard : {}),
      uiTemplate: nextValues.uiTemplate,
    };

    await manageBoardsActions.saveBoardRecord(selectedBoardId, nextRecord);
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
      console.error('[BoardConfigPanel] Failed to import runtime dump', error);
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
      console.error('[BoardConfigPanel] Failed to prepare template ingest', error);
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
      console.error('[BoardConfigPanel] Failed to export runtime dump', error);
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
      console.error('[BoardConfigPanel] Failed to refresh workspace bootstrap', error);
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
    && boardId === 'live-test-frontend';
  const smokeRunnerTitle = smokeRunnerEnabled
    ? 'Run the in-app smoke suite against the live-test-frontend board'
    : 'Smoke suite is only available when the active board id is live-test-frontend';

  const smokeStrategistEnabled = formState.transportMode === BOARD_TRANSPORT_MODE_SERVER_URL
    && boardId === 'live-test-journey-frontend';
  const smokeStrategistTitle = smokeStrategistEnabled
    ? 'Run the strategist smoke suite against the live-test-journey-frontend board'
    : 'Strategist smoke suite is only available when the active board id is live-test-journey-frontend';

  const closeAddBoard = () => {
    if (addBoardSubmitting) return;
    setAddBoardOpen(false);
    setAddBoardError('');
  };

  return (
    <>
      <FileUpload
        ref={importFileInputRef}
        variant="input"
        accept="application/json,.json"
        onFiles={async (files) => {
          const file = files[0];
          if (!file) return;
          await handleImportRuntimeDump(file);
        }}
      />

      <PanelVertical
        fabPosition="bottom-right"
        expanded={open}
        onToggle={() => {
          setOpenedByAuto(false);
          setOpen((current) => !current);
        }}
        ariaLabel="Board settings"
        title={open ? 'Close board settings' : 'Board settings'}
        icon="bi-gear-fill"
        iconToggled="bi-x-lg"
        backdropClassName="board-config-backdrop"
        asideStyle={{ zIndex: 5000 }}
        fabProps={{
          'data-testid': 'open-board-settings',
          'aria-label': open ? 'Close board settings' : 'Open board settings',
        }}
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
            <div className="board-ingest-pane__header">
              <BoardSwitcher
                value={formState.defaultBoardId}
                options={boardSelectOptions}
                currentBoardId={boardId}
                onChange={handleBoardSelectionChange}
                onSwitch={submitAndReload}
                selectDisabled={formState.transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL || loadingBoardOptions}
                loading={loadingBoardOptions}
                layoutKind={layoutKind}
                onToggleLayout={() => { void handleToggleLayout(); }}
                layoutToggleDisabled={formState.transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL || !formState.defaultBoardId}
                togglingLayout={togglingLayout}
                themePackId={themePackId}
                onToggleTheme={() => { void handleToggleTheme(); }}
                themeToggleDisabled={formState.transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL || !formState.defaultBoardId}
                togglingTheme={togglingTheme}
                smokeRunnerEnabled={smokeRunnerEnabled}
                onRunSmokeRunner={() => setSmokeRunnerOpen(true)}
                smokeRunnerTitle={smokeRunnerTitle}
                smokeStrategistEnabled={smokeStrategistEnabled}
                onRunStrategist={() => setSmokeStrategistOpen(true)}
                smokeStrategistTitle={smokeStrategistTitle}
              />
            </div>

            <div className="board-settings-form flex-grow-1 min-h-0">
              <div className="d-flex align-items-center justify-content-between gap-2 mb-3">
                <BoardConfigButton
                  iconNode={PLUS_ICON_SVG}
                  onClick={() => {
                    setAddBoardError('');
                    setAddBoardOpen(true);
                  }}
                  disabled={formState.transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL || loadingBoardOptions}
                  title="New board"
                >
                  New Board
                </BoardConfigButton>
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
                      <BoardConfigButton onClick={() => setPendingAction('config')}>
                        Reset Server
                      </BoardConfigButton>
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

              {seedManifestError ? (
                <div className="board-settings-form__hint text-danger">
                  Seed board manifest error: {seedManifestError}
                </div>
              ) : null}
            </div>
          </>
        )}
      </PanelVertical>

      {open && pendingAction === 'runtime-import' ? (
        <ChallengeConfirmModal
          message="This will overwrite the current runtime card state from a local dump file. Cards not present in the file will be removed."
          onConfirm={() => {
            setPendingAction(null);
            importFileInputRef.current?.open();
          }}
          onCancel={() => setPendingAction(null)}
        />
      ) : null}
      {open && pendingAction === 'config' ? (
        <ChallengeConfirmModal
          message="This will clear all stored config overrides and reload with the shipped defaults."
          onConfirm={() => { setPendingAction(null); handleReset(); }}
          onCancel={() => setPendingAction(null)}
        />
      ) : null}
      {open && smokeRunnerOpen ? (
        <SmokeRunner
          serverOrigin={formState.serverOrigin}
          onClose={() => setSmokeRunnerOpen(false)}
        />
      ) : null}
      {open && smokeStrategistOpen ? (
        <SmokeStrategist
          serverOrigin={formState.serverOrigin}
          onClose={() => setSmokeStrategistOpen(false)}
        />
      ) : null}
    </>
  );
}