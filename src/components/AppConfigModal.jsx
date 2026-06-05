import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { GlobalModal } from './GlobalModal.jsx';

const RUNTIME_DUMP_VERSION = 1;
const SEED_BOARDS_BASE_URL = `${import.meta.env.BASE_URL}assets/seed-boards/`;
const SEED_BOARDS_MANIFEST_URL = `${SEED_BOARDS_BASE_URL}index.json`;
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
    ai: 'copilot',
    aiWorkspaceTemplate: 'default',
    refsTemplate: 'localfs-default',
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

function normalizeManagedBoardEntries(payload) {
  const boards = Array.isArray(payload?.boards) ? payload.boards : [];
  return boards
    .map((board) => {
      const id = typeof board?.id === 'string' ? board.id.trim() : '';
      const label = typeof board?.label === 'string' ? board.label.trim() : '';
      if (!id) return null;
      return {
        id,
        label: label || id,
        metadata: board?.metadata && typeof board.metadata === 'object' && !Array.isArray(board.metadata)
          ? board.metadata
          : {},
      };
    })
    .filter(Boolean);
}

async function fetchManagedBoards(serverOrigin) {
  const normalizedOrigin = typeof serverOrigin === 'string'
    ? serverOrigin.trim().replace(/\/+$/, '')
    : '';
  if (!normalizedOrigin) {
    return [];
  }

  const response = await fetch(`${normalizedOrigin}/manage-boards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subcommand: 'list-boards' }),
  });
  if (!response.ok) {
    throw new Error(`Failed to load boards: ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.status !== 'success') {
    const message = typeof payload?.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : 'Board listing failed';
    throw new Error(message);
  }

  return normalizeManagedBoardEntries(payload.data);
}

async function addManagedBoard(serverOrigin, candidate) {
  const normalizedOrigin = typeof serverOrigin === 'string'
    ? serverOrigin.trim().replace(/\/+$/, '')
    : '';
  if (!normalizedOrigin) {
    throw new Error('Server origin is required');
  }

  const normalized = {
    boardId: typeof candidate?.boardId === 'string' ? candidate.boardId.trim() : '',
    label: typeof candidate?.label === 'string' ? candidate.label.trim() : '',
    ai: typeof candidate?.ai === 'string' ? candidate.ai.trim() : '',
    aiWorkspaceTemplate: typeof candidate?.aiWorkspaceTemplate === 'string' ? candidate.aiWorkspaceTemplate.trim() : '',
    refsTemplate: typeof candidate?.refsTemplate === 'string' ? candidate.refsTemplate.trim() : '',
  };

  if (!normalized.boardId) {
    throw new Error('Board id is required');
  }
  if (!normalized.label) {
    throw new Error('Label is required');
  }
  if (!normalized.ai) {
    throw new Error('AI is required');
  }
  if (!normalized.aiWorkspaceTemplate) {
    throw new Error('AI workspace template is required');
  }
  if (!normalized.refsTemplate) {
    throw new Error('Refs template is required');
  }

  const response = await fetch(`${normalizedOrigin}/manage-boards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subcommand: 'add-board',
      args: {
        boardId: normalized.boardId,
        record: {
          label: normalized.label,
          ai: normalized.ai,
          aiWorkspaceTemplate: normalized.aiWorkspaceTemplate,
          refsTemplate: normalized.refsTemplate,
        },
      },
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.status !== 'success') {
    const message = typeof payload?.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : `Failed to add board: ${response.status}`;
    throw new Error(message);
  }

  return payload?.data?.board ?? null;
}

async function saveBoardMeta(serverOrigin, boardId, metadata) {
  const normalizedOrigin = typeof serverOrigin === 'string'
    ? serverOrigin.trim().replace(/\/+$/, '')
    : '';
  if (!normalizedOrigin) {
    throw new Error('Server origin is required');
  }
  const normalizedBoardId = typeof boardId === 'string' ? boardId.trim() : '';
  if (!normalizedBoardId) {
    throw new Error('Board id is required');
  }

  const response = await fetch(`${normalizedOrigin}/manage-boards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subcommand: 'save-meta',
      args: {
        boardId: normalizedBoardId,
        metadata,
      },
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.status !== 'success') {
    const message = typeof payload?.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : `Failed to save board metadata: ${response.status}`;
    throw new Error(message);
  }

  return payload?.data?.board ?? null;
}

function AddBoardModal({ onClose, onSubmit, submitting = false, errorMessage = '' }) {
  const [formState, setFormState] = useState(() => createEmptyAddBoardForm());
  const [localError, setLocalError] = useState('');

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
      ai: formState.ai.trim(),
      aiWorkspaceTemplate: formState.aiWorkspaceTemplate.trim(),
      refsTemplate: formState.refsTemplate.trim(),
    };

    if (!normalized.boardId || !normalized.label || !normalized.ai || !normalized.aiWorkspaceTemplate || !normalized.refsTemplate) {
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
          <input className="board-input" type="text" value={formState.boardId} onChange={updateField('boardId')} placeholder="live-test" />
        </label>
        <label className="board-settings-field mb-0">
          <span>Label</span>
          <input className="board-input" type="text" value={formState.label} onChange={updateField('label')} placeholder="Live Test" />
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
          <span>Refs Template</span>
          <input className="board-input" type="text" value={formState.refsTemplate} onChange={updateField('refsTemplate')} placeholder="localfs-default" />
        </label>
        {localError || errorMessage ? (
          <div className="board-settings-form__hint text-danger">
            {localError || errorMessage}
          </div>
        ) : null}
        <div className="d-flex justify-content-end gap-2">
          <button type="button" className="btn btn-outline-secondary board-button" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" className="btn btn-primary board-button" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add board'}
          </button>
        </div>
      </form>
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
    refreshAllIntervalMinutes: String(Math.max(1, Math.round(Number(config?.refreshAllIntervalSeconds ?? 0) / 60)) || 30),
    transportMode: config?.transportMode ?? BOARD_TRANSPORT_MODE_SERVER_URL,
    serverOrigin: config?.serverOrigin ?? '',
    storageAdapter: config?.storage?.adapter ?? STORAGE_ADAPTER_FIRESTORE,
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
  const [loadingSeedManifest, setLoadingSeedManifest] = useState(false);
  const [seedManifestError, setSeedManifestError] = useState('');
  const [seedManifestEntries, setSeedManifestEntries] = useState([]);
  const [selectedSeedFileName, setSelectedSeedFileName] = useState('');
  const [loadingBoardOptions, setLoadingBoardOptions] = useState(false);
  const [boardOptionsError, setBoardOptionsError] = useState('');
  const [boardOptions, setBoardOptions] = useState([]);
  const [addBoardOpen, setAddBoardOpen] = useState(false);
  const [addBoardSubmitting, setAddBoardSubmitting] = useState(false);
  const [addBoardError, setAddBoardError] = useState('');
  const [saveMetaError, setSaveMetaError] = useState('');
  const [pendingAction, setPendingAction] = useState(null); // 'reset' | 'save' | null
  const importFileInputRef = useRef(null);
  const overrideActive = hasStoredAppConfigOverride();
  const serverOriginHasError = serverUnreachable && formState.transportMode === BOARD_TRANSPORT_MODE_SERVER_URL;
  const runtimeAlertBadge = formState.transportMode === BOARD_TRANSPORT_MODE_INBROWSER
    ? 'Runtime storage init failed'
    : 'Server unreachable';

  const reloadBoardOptions = useCallback(async (serverOrigin) => {
    setLoadingBoardOptions(true);
    setBoardOptionsError('');
    try {
      const entries = await fetchManagedBoards(serverOrigin);
      setBoardOptions(entries);
    } catch (error) {
      setBoardOptions([]);
      setBoardOptionsError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingBoardOptions(false);
    }
  }, []);

  const handleAddBoard = useCallback(async (candidate) => {
    setAddBoardSubmitting(true);
    setAddBoardError('');
    try {
      const createdBoard = await addManagedBoard(formState.serverOrigin, candidate);
      await reloadBoardOptions(formState.serverOrigin);
      setFormState((current) => ({
        ...current,
        defaultBoardId: candidate.boardId,
      }));
      setAddBoardOpen(false);
      return createdBoard;
    } catch (error) {
      setAddBoardError(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      setAddBoardSubmitting(false);
    }
  }, [formState.serverOrigin, reloadBoardOptions]);

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

  useEffect(() => {
    if (!open) return undefined;

    if (formState.transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL) {
      setBoardOptions([]);
      setBoardOptionsError('');
      setLoadingBoardOptions(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void reloadBoardOptions(formState.serverOrigin).catch(() => {});
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [formState.serverOrigin, formState.transportMode, open, reloadBoardOptions]);

  const updateField = (field) => (event) => {
    const value = event.target.value;
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleBoardSelectionChange = (event) => {
    const nextBoardId = event.target.value;
    const selected = boardOptions.find((entry) => entry.id === nextBoardId);
    setFormState((current) => {
      const base = { ...current, defaultBoardId: nextBoardId };
      if (!selected) return base;
      const metadata = selected.metadata && typeof selected.metadata === 'object' && !Array.isArray(selected.metadata)
        ? selected.metadata
        : {};
      const refreshSeconds = Number(metadata.refreshAllIntervalSeconds);
      return {
        ...base,
        defaultBoardLabel: typeof metadata.pageTitle === 'string' && metadata.pageTitle
          ? metadata.pageTitle
          : selected.label,
        defaultBoardSubtitle: typeof metadata.pageSubtitle === 'string'
          ? metadata.pageSubtitle
          : '',
        refreshAllIntervalMinutes: Number.isFinite(refreshSeconds) && refreshSeconds > 0
          ? String(Math.max(1, Math.round(refreshSeconds / 60)))
          : '60',
      };
    });
  };

  const submitAndReload = useCallback(() => {
    saveAppConfigOverride(normalizeFormState(formState, getAppConfig()));
    window.location.reload();
  }, [formState]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (formState.transportMode === BOARD_TRANSPORT_MODE_SERVER_URL && formState.defaultBoardId) {
      try {
        await saveBoardMeta(formState.serverOrigin, formState.defaultBoardId, metadataFromFormState(formState));
        setSaveMetaError('');
      } catch (error) {
        setSaveMetaError(error instanceof Error ? error.message : String(error));
        return;
      }
    }
    submitAndReload();
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
    const response = await fetch(`${SEED_BOARDS_BASE_URL}${encodeURIComponent(selectedSeedFileName)}`, { cache: 'no-store' });
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
            aria-label="Board settings"
          >
            <div className="board-settings-modal__header">
              <div>
                <div className="board-settings-modal__eyebrow mb-2">Board</div>
                <div className="d-flex align-items-center gap-2">
                  <select
                    className="board-input board-settings-sample-select"
                    value={formState.defaultBoardId}
                    onChange={handleBoardSelectionChange}
                    disabled={formState.transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL || loadingBoardOptions}
                  >
                    {boardSelectOptions.length === 0 ? (
                      <option value="">
                        {loadingBoardOptions ? 'Loading boards…' : 'No boards available'}
                      </option>
                    ) : null}
                    {boardSelectOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-primary board-button d-inline-flex align-items-center gap-1"
                    onClick={submitAndReload}
                    title="Save and reload"
                    aria-label="Save and reload"
                  >
                    {FORWARD_ICON_SVG}
                    Go
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary board-button d-inline-flex align-items-center gap-1 ms-auto"
                    onClick={() => {
                      setAddBoardError('');
                      setAddBoardOpen(true);
                    }}
                    disabled={formState.transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL || loadingBoardOptions}
                    title="New board"
                  >
                    {PLUS_ICON_SVG}
                    New
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

              <div className="board-settings-io-section">
                <div className="board-settings-io-card d-flex flex-column gap-3">
                  <div className="d-flex align-items-center justify-content-between gap-2">
                    <div className="board-settings-io-card__title">Page Details</div>
                    <button type="submit" className="btn btn-outline-secondary board-button">Save</button>
                  </div>

                  <label className="board-settings-field mb-0">
                    <span>Page Title</span>
                    <input className="board-input" type="text" value={formState.defaultBoardLabel} onChange={updateField('defaultBoardLabel')} placeholder="Live" />
                  </label>

                  <label className="board-settings-field mb-0">
                    <span>Page Subtitle</span>
                    <input className="board-input" type="text" value={formState.defaultBoardSubtitle} onChange={updateField('defaultBoardSubtitle')} placeholder="Live operational intelligence for agent workflows" />
                  </label>

                  <label className="board-settings-field mb-0">
                    <span>Refresh Interval (minutes)</span>
                    <input className="board-input" type="number" min="1" step="1" value={formState.refreshAllIntervalMinutes} onChange={updateField('refreshAllIntervalMinutes')} placeholder="30" />
                  </label>

                  {saveMetaError ? (
                    <div className="board-settings-form__hint text-danger">
                      Save failed: {saveMetaError}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="board-settings-io-section">
                <div className="board-settings-io-card d-flex flex-column gap-3">
                  <div className="d-flex align-items-center justify-content-between gap-2">
                    <div className="board-settings-io-card__title">Server</div>
                    <button
                      type="button"
                      className="btn btn-outline-secondary board-button"
                      onClick={() => setPendingAction('config')}
                    >
                      Reset Server
                    </button>
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
                <button type="button" className="btn btn-outline-secondary board-button" onClick={() => setOpen(false)}>Close</button>
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
          {addBoardOpen ? (
            <AddBoardModal
              onClose={() => {
                if (addBoardSubmitting) return;
                setAddBoardOpen(false);
                setAddBoardError('');
              }}
              onSubmit={handleAddBoard}
              submitting={addBoardSubmitting}
              errorMessage={addBoardError}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}