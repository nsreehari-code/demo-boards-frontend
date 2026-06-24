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
import { ChallengeConfirmModal } from './shared/ChallengeConfirmModal.jsx';
import { FloatingCircularButton } from './shared/FloatingCircularButton.jsx';
import { GlobalModal } from './shared/GlobalModal.jsx';
import { SmokeRunner } from './test/SmokeRunner.jsx';
import { SmokeStrategist } from './test/SmokeStrategist.jsx';

const RUNTIME_DUMP_VERSION = 1;
const FORWARD_ICON_SVG = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M5 12h12"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
    />
    <path
      d="M13 6l6 6-6 6"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

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

function createEmptyAddBoardForm() {
  return {
    boardId: '',
    label: '',
    pageTitle: '',
    pageSubtitle: '',
    ai: 'copilot',
    aiWorkspaceTemplate: 'default',
    uiTemplate: 'default',
    refsTemplate: 'localfs-default',
    templateKey: '',
  };
}

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

function AddBoardModal({ onClose, onSubmit, templateOptions = [], loadingTemplates = false, submitting = false, errorMessage = '' }) {
  const [formState, setFormState] = useState(() => createEmptyAddBoardForm());
  const [localError, setLocalError] = useState('');
  const isSubmitDisabled = [
    formState.boardId,
    formState.label,
    formState.pageTitle,
    formState.pageSubtitle,
    formState.ai,
    formState.aiWorkspaceTemplate,
    formState.uiTemplate,
    formState.refsTemplate,
  ].some((value) => !value.trim()) || submitting;

  const updateField = (field) => (event) => {
    const value = event.target.value;
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
    if (localError) {
      setLocalError('');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const normalized = {
      boardId: formState.boardId.trim(),
      label: formState.label.trim(),
      pageTitle: formState.pageTitle.trim(),
      pageSubtitle: formState.pageSubtitle.trim(),
      ai: formState.ai.trim(),
      aiWorkspaceTemplate: formState.aiWorkspaceTemplate.trim(),
      uiTemplate: formState.uiTemplate.trim(),
      refsTemplate: formState.refsTemplate.trim(),
      templateKey: formState.templateKey.trim(),
    };

    if (!normalized.boardId || !normalized.label || !normalized.pageTitle || !normalized.pageSubtitle || !normalized.ai || !normalized.aiWorkspaceTemplate || !normalized.uiTemplate || !normalized.refsTemplate) {
      setLocalError('All fields are required.');
      return;
    }

    setLocalError('');
    try {
      await onSubmit(normalized);
    } catch {
      // Parent surfaces request failures through errorMessage.
    }
  };

  return (
    <GlobalModal title="Add board" onClose={onClose} className="board-modal__dialog" bodyClassName="p-3">
      <form className="d-flex flex-column gap-3" onSubmit={handleSubmit}>
        <label className="board-settings-field mb-0">
          <span>Board Id</span>
          <input className="board-input" type="text" value={formState.boardId} onChange={updateField('boardId')} placeholder="live-test-frontend" />
        </label>
        <label className="board-settings-field mb-0">
          <span>Label</span>
          <input className="board-input" type="text" value={formState.label} onChange={updateField('label')} placeholder="Live Test" />
        </label>
        <label className="board-settings-field mb-0">
          <span>Page Title</span>
          <input className="board-input" type="text" value={formState.pageTitle} onChange={updateField('pageTitle')} placeholder="Live Test" />
        </label>
        <label className="board-settings-field mb-0">
          <span>Page Subtitle</span>
          <input className="board-input" type="text" value={formState.pageSubtitle} onChange={updateField('pageSubtitle')} placeholder="Live operational intelligence for agent workflows" />
        </label>
        <label className="board-settings-field mb-0">
          <span>AI</span>
          <input className="board-input" type="text" value={formState.ai} onChange={updateField('ai')} placeholder="copilot" />
        </label>
        <label className="board-settings-field mb-0">
          <span>AI Workspace Template</span>
          <input className="board-input" type="text" value={formState.aiWorkspaceTemplate} onChange={updateField('aiWorkspaceTemplate')} placeholder="default" />
        </label>
        <label className="board-settings-field mb-0">
          <span>UI Template</span>
          <input className="board-input" type="text" value={formState.uiTemplate} onChange={updateField('uiTemplate')} placeholder="default" />
        </label>
        <label className="board-settings-field mb-0">
          <span>Refs Template</span>
          <input className="board-input" type="text" value={formState.refsTemplate} onChange={updateField('refsTemplate')} placeholder="localfs-default" />
        </label>
        <label className="board-settings-field mb-0">
          <span>Card Template (optional)</span>
                      <select className="board-input" value={formState.templateKey} onChange={updateField('templateKey')} disabled={loadingTemplates}>
            <option value="">No template</option>
            {templateOptions.map((entry) => (
                          <option key={entry.key} value={entry.key}>{entry.label}</option>
            ))}
          </select>
          <div className="board-settings-form__hint">
            {loadingTemplates ? 'Loading templates…' : 'If selected, the template cards will be ingested into the newly created board.'}
          </div>
        </label>
        {localError || errorMessage ? (
          <div className="board-settings-form__hint text-danger">
            {localError || errorMessage}
          </div>
        ) : null}
        <div className="d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-outline-secondary board-button" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn btn-primary board-button" disabled={isSubmitDisabled}>
            {submitting ? 'Adding…' : 'Add board'}
          </button>
        </div>
      </form>
    </GlobalModal>
  );
}

function toPageDetailsDraft(board) {
  const metadata = board?.metadata && typeof board.metadata === 'object' && !Array.isArray(board.metadata)
    ? board.metadata
    : {};
  const refreshSeconds = Number(metadata.refreshAllIntervalSeconds);
  return {
    pageTitle: typeof metadata.pageTitle === 'string' && metadata.pageTitle.trim()
      ? metadata.pageTitle.trim()
      : (typeof board?.label === 'string' ? board.label.trim() : ''),
    pageSubtitle: typeof metadata.pageSubtitle === 'string' ? metadata.pageSubtitle : '',
    refreshAllIntervalMinutes: Number.isFinite(refreshSeconds) && refreshSeconds > 0
      ? String(Math.max(1, Math.round(refreshSeconds / 60)))
      : '60',
    uiTemplate: typeof board?.uiTemplate === 'string' && board.uiTemplate.trim()
      ? board.uiTemplate.trim()
      : 'default',
  };
}

function PageDetailsSection({
  boardId,
  transportMode,
  loadBoard,
  onSave,
}) {
  const [draft, setDraft] = useState(() => toPageDetailsDraft(null));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL || !boardId) {
      setDraft(toPageDetailsDraft(null));
      setLoading(false);
      setErrorMessage('');
      setSuccessMessage('');
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    const fetchBoard = async () => {
      try {
        const board = await loadBoard(boardId);
        if (cancelled) return;
        setDraft(toPageDetailsDraft(board));
      } catch (error) {
        if (cancelled) return;
        setDraft(toPageDetailsDraft(null));
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchBoard();
    return () => {
      cancelled = true;
    };
  }, [boardId, loadBoard, transportMode]);

  const updateField = (field) => (event) => {
    const value = event.target.value;
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
    if (errorMessage) setErrorMessage('');
    if (successMessage) setSuccessMessage('');
  };

  const saveDisabled = transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL
    || !boardId
    || loading
    || saving
    || !draft.pageTitle.trim()
    || !draft.pageSubtitle.trim()
    || !draft.refreshAllIntervalMinutes.trim()
    || !draft.uiTemplate.trim();

  const handleSave = async () => {
    const nextValues = {
      pageTitle: draft.pageTitle.trim(),
      pageSubtitle: draft.pageSubtitle.trim(),
      refreshAllIntervalMinutes: draft.refreshAllIntervalMinutes.trim(),
      uiTemplate: draft.uiTemplate.trim(),
    };

    if (!nextValues.pageTitle || !nextValues.pageSubtitle || !nextValues.refreshAllIntervalMinutes || !nextValues.uiTemplate) {
      setErrorMessage('All page detail fields are required.');
      setSuccessMessage('');
      return;
    }

    setSaving(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const savedBoard = await onSave(boardId, nextValues);
      setDraft(toPageDetailsDraft(savedBoard));
      setSuccessMessage('Saved.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="board-settings-io-card d-flex flex-column gap-3">
      <div className="d-flex align-items-center justify-content-between gap-2">
        <div className="board-settings-io-card__title">Page Details</div>
        <button type="button" className="btn btn-outline-secondary board-button" onClick={() => { void handleSave(); }} disabled={saveDisabled}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <label className="board-settings-field mb-0">
        <span>Page Title</span>
        <input className="board-input" type="text" value={draft.pageTitle} onChange={updateField('pageTitle')} placeholder="Live" disabled={loading || transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL || !boardId} />
      </label>

      <label className="board-settings-field mb-0">
        <span>Page Subtitle</span>
        <input className="board-input" type="text" value={draft.pageSubtitle} onChange={updateField('pageSubtitle')} placeholder="Live operational intelligence for agent workflows" disabled={loading || transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL || !boardId} />
      </label>

      <label className="board-settings-field mb-0">
        <span>Refresh Interval (minutes)</span>
        <input className="board-input" type="number" min="1" step="1" value={draft.refreshAllIntervalMinutes} onChange={updateField('refreshAllIntervalMinutes')} placeholder="30" disabled={loading || transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL || !boardId} />
      </label>

      {loading ? (
        <div className="board-settings-form__hint text-muted">
          Loading latest board details…
        </div>
      ) : null}

      {errorMessage ? (
        <div className="board-settings-form__hint text-danger">
          Save failed: {errorMessage}
        </div>
      ) : null}
      {!errorMessage && successMessage ? (
        <div className="board-settings-form__hint text-success">
          {successMessage}
        </div>
      ) : null}
    </div>
  );
}

function describeCard(card) {
  const id = typeof card?.id === 'string' ? card.id.trim() : '';
  const title = typeof card?.meta?.title === 'string' ? card.meta.title.trim() : '';
  return { id, title };
}

function TemplateIngestModal({ templateLabel, cardsToReplace, cardsToAdd, invalidCards = [], ingesting = false, onConfirm, onCancel }) {
  const hasInvalidCards = invalidCards.length > 0;

  return (
    <GlobalModal title="Ingest Cards from Template" onClose={onCancel} className="board-modal__dialog" bodyClassName="p-3">
      <div className="d-flex flex-column gap-3">
        <div className="small text-muted">
          Template: <strong>{templateLabel || 'Selected template'}</strong>
        </div>
        <div className="small">
          This will upsert template cards into the current board. Existing cards with matching ids will be replaced. Board label, subtitle, and other board settings will not be changed.
        </div>
        <div className="d-flex gap-3 flex-wrap small">
          <div className="badge text-bg-light border">Replace: {cardsToReplace.length}</div>
          <div className="badge text-bg-light border">Add: {cardsToAdd.length}</div>
          {hasInvalidCards ? (
            <div className="badge border text-bg-danger border-danger">Invalid: {invalidCards.length}</div>
          ) : null}
        </div>
        {hasInvalidCards ? (
          <div className="d-flex flex-column gap-2">
            <div className="fw-semibold small">Invalid cards</div>
            <div className="border border-danger-subtle rounded p-2 bg-danger-subtle" style={{ maxHeight: '180px', overflow: 'auto' }}>
              {invalidCards.map((card, index) => (
                <div key={card.id || `invalid-${index}`} className="small py-1">
                  <div>
                    <strong>{card.id || '(missing id)'}</strong>
                    {card.title ? ` - ${card.title}` : ''}
                  </div>
                  {Array.isArray(card.issues) && card.issues.length > 0 ? (
                    <div className="text-danger-emphasis">
                      {card.issues.join('; ')}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="d-flex flex-column gap-2">
          <div className="fw-semibold small">Cards to replace</div>
          {cardsToReplace.length === 0 ? (
            <div className="small text-muted">None.</div>
          ) : (
            <div className="border rounded p-2" style={{ maxHeight: '220px', overflow: 'auto' }}>
              {cardsToReplace.map((card) => (
                <div key={card.id} className="small py-1">
                  <strong>{card.id}</strong>
                  {card.title ? ` - ${card.title}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="d-flex flex-column gap-2">
          <div className="fw-semibold small">New cards to add</div>
          {cardsToAdd.length === 0 ? (
            <div className="small text-muted">None.</div>
          ) : (
            <div className="border rounded p-2" style={{ maxHeight: '160px', overflow: 'auto' }}>
              {cardsToAdd.map((card) => (
                <div key={card.id} className="small py-1">
                  <strong>{card.id}</strong>
                  {card.title ? ` - ${card.title}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-outline-secondary board-button" onClick={onCancel} disabled={ingesting}>
            Discard
          </button>
          <button type="button" className="btn btn-primary board-button" onClick={onConfirm} disabled={ingesting || hasInvalidCards}>
            {hasInvalidCards ? 'Fix Invalid Cards First' : (ingesting ? 'Ingesting…' : 'Go Ahead')}
          </button>
        </div>
      </div>
    </GlobalModal>
  );
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
            <div className="board-settings-modal__header">
              <div className="board-settings-modal__header-content">
                <div className="board-settings-modal__eyebrow mb-2">Board</div>
                <div className="d-flex align-items-center gap-2 board-settings-board-row">
                  <select
                    className="board-input board-settings-sample-select board-settings-board-select"
                    value={formState.defaultBoardId}
                    onChange={handleBoardSelectionChange}
                    disabled={formState.transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL || loadingBoardOptions}
                    data-testid="board-settings-board-select"
                  >
                    {boardSelectOptions.length === 0 ? (
                      <option value="">
                        {loadingBoardOptions ? 'Loading boards…' : 'No boards available'}
                      </option>
                    ) : null}
                    {boardSelectOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}{entry.id === boardId ? ' (current)' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-primary board-button board-settings-go-button d-inline-flex align-items-center gap-1"
                    onClick={submitAndReload}
                    disabled={formState.defaultBoardId === boardId}
                    title="Switch board"
                    aria-label="Switch board"
                  >
                    {FORWARD_ICON_SVG}
                    Switch
                  </button>
                </div>
              </div>
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
                <PageDetailsSection
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
                <div className="board-settings-io-card d-flex flex-column gap-3">
                  <div className="board-settings-io-card__title">Board Import / Export</div>

                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      className="btn btn-outline-secondary board-button"
                      onClick={() => setPendingAction('runtime-import')}
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
                    <button
                      type="button"
                      className="btn btn-outline-secondary board-button"
                      onClick={() => { void handleRefreshWorkspaceBootstrap(); }}
                      disabled={refreshingWorkspaceBootstrap || !boardId}
                      title="Refresh the ai workspace and admin-cards to bootstrap state"
                    >
                      {refreshingWorkspaceBootstrap ? 'Refreshing…' : 'Refresh Workspace Bootstrap'}
                    </button>
                  </div>
                </div>

                <div className="board-settings-io-card d-flex flex-column gap-3">
                  <div className="board-settings-io-card__title">Template Card Ingest</div>

                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <select
                      className="board-input board-settings-sample-select"
                      value={selectedSeedTemplateKey}
                      onChange={(event) => setSelectedSeedTemplateKey(event.target.value)}
                      disabled={loadingSeedManifest || resettingSeeds || preparingTemplateIngest || seedManifestEntries.length === 0}
                      title={seedManifestError || 'Select a bundled sample board file'}
                    >
                      {seedManifestEntries.length === 0 ? (
                        <option value="">{loadingSeedManifest ? 'Loading seed boards…' : 'No seed boards available'}</option>
                      ) : null}
                      {seedManifestEntries.map((entry) => (
                        <option key={entry.key} value={entry.key}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-outline-secondary board-button"
                      onClick={() => { void handlePrepareTemplateIngest(); }}
                      disabled={resettingSeeds || preparingTemplateIngest || !boardId || !selectedSeedTemplateKey || loadingSeedManifest || seedManifestEntries.length === 0}
                      title="Preview cards that will be added or replaced from the selected template"
                    >
                      {preparingTemplateIngest ? 'Preparing…' : resettingSeeds ? 'Ingesting…' : 'Ingest Cards from Template'}
                    </button>
                  </div>
                </div>
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
          {templateIngestPreview ? (
            <TemplateIngestModal
              templateLabel={templateIngestPreview.templateLabel}
              cardsToReplace={templateIngestPreview.cardsToReplace}
              cardsToAdd={templateIngestPreview.cardsToAdd}
              invalidCards={templateIngestPreview.invalidCards}
              ingesting={resettingSeeds}
              onConfirm={() => { void handleConfirmTemplateIngest(); }}
              onCancel={() => setTemplateIngestPreview(null)}
            />
          ) : null}
          {addBoardOpen ? (
            <AddBoardModal
              onClose={() => {
                if (addBoardSubmitting) return;
                setAddBoardOpen(false);
                setAddBoardError('');
              }}
              onSubmit={handleAddBoard}
              templateOptions={seedManifestEntries}
              loadingTemplates={loadingSeedManifest}
              submitting={addBoardSubmitting}
              errorMessage={addBoardError}
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