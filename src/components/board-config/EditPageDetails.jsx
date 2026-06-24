import React, { useEffect, useMemo, useState } from 'react';
import { BOARD_TRANSPORT_MODE_SERVER_URL } from '../../lib/appConfig.js';
import { Form } from '../shared/Form.jsx';

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

  const fieldsDisabled = loading || transportMode !== BOARD_TRANSPORT_MODE_SERVER_URL || !boardId;

  const spec = useMemo(() => ({
    fields: {
      properties: {
        pageTitle: { title: 'Page Title', placeholder: 'Live', disabled: fieldsDisabled },
        pageSubtitle: { title: 'Page Subtitle', placeholder: 'Live operational intelligence for agent workflows', disabled: fieldsDisabled },
        refreshAllIntervalMinutes: { title: 'Refresh Interval (minutes)', type: 'integer', minimum: 1, placeholder: '30', disabled: fieldsDisabled },
      },
      required: ['pageTitle', 'pageSubtitle', 'refreshAllIntervalMinutes'],
    },
  }), [fieldsDisabled]);

  const handleSave = async (values) => {
    const nextValues = {
      pageTitle: String(values.pageTitle ?? '').trim(),
      pageSubtitle: String(values.pageSubtitle ?? '').trim(),
      refreshAllIntervalMinutes: String(values.refreshAllIntervalMinutes ?? '').trim(),
      uiTemplate: String(values.uiTemplate ?? '').trim(),
    };

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
      <div className="board-settings-io-card__title">Page Details</div>

      <Form
        spec={spec}
        baseValues={draft}
        idPrefix="page-details"
        onSave={handleSave}
        submitLabel={saving ? 'Saving…' : 'Save'}
        submitting={saving}
        canSubmit={!fieldsDisabled}
        error={errorMessage ? `Save failed: ${errorMessage}` : ''}
      />

      {loading ? (
        <div className="board-settings-form__hint text-muted">
          Loading latest board details…
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
