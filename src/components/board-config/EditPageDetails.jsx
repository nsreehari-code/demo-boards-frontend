import React, { useEffect, useState } from 'react';
import { BOARD_TRANSPORT_MODE_SERVER_URL } from '../../lib/appConfig.js';
import { SchemaForm } from '../shared/SchemaForm.jsx';

export function toPageDetailsDraft(board) {
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

export function EditPageDetails({
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

  const setPageField = (key, value) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
    if (errorMessage) setErrorMessage('');
    if (successMessage) setSuccessMessage('');
  };

  const fieldsDisabled = loading || transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL || !boardId;

  const pageDetailFields = [
    { key: 'pageTitle', label: 'Page Title', placeholder: 'Live' },
    { key: 'pageSubtitle', label: 'Page Subtitle', placeholder: 'Live operational intelligence for agent workflows' },
    { key: 'refreshAllIntervalMinutes', label: 'Refresh Interval (minutes)', type: 'number', min: '1', step: '1', placeholder: '30' },
  ];

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

      <SchemaForm spec={{ fields: pageDetailFields }} value={draft} setValue={setPageField} disabled={fieldsDisabled} />

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
