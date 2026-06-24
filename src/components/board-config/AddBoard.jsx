import React, { useState } from 'react';
import { SchemaForm } from '../shared/SchemaForm.jsx';

export function createEmptyAddBoardForm() {
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

export function AddBoard({ onClose, onSubmit, templateOptions = [], loadingTemplates = false, submitting = false, errorMessage = '' }) {
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

  const setBoardField = (key, value) => {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
    if (localError) {
      setLocalError('');
    }
  };

  const formFields = [
    { key: 'boardId', label: 'Board Id', placeholder: 'live-test-frontend' },
    { key: 'label', label: 'Label', placeholder: 'Live Test' },
    { key: 'pageTitle', label: 'Page Title', placeholder: 'Live Test' },
    { key: 'pageSubtitle', label: 'Page Subtitle', placeholder: 'Live operational intelligence for agent workflows' },
    { key: 'ai', label: 'AI', placeholder: 'copilot' },
    { key: 'aiWorkspaceTemplate', label: 'AI Workspace Template', placeholder: 'default' },
    { key: 'uiTemplate', label: 'UI Template', placeholder: 'default' },
    { key: 'refsTemplate', label: 'Refs Template', placeholder: 'localfs-default' },
    {
      key: 'templateKey',
      label: 'Card Template (optional)',
      type: 'select',
      disabled: loadingTemplates,
      options: [{ value: '', label: 'No template' }, ...templateOptions.map((entry) => ({ value: entry.key, label: entry.label }))],
      hint: loadingTemplates ? 'Loading templates…' : 'If selected, the template cards will be ingested into the newly created board.',
    },
  ];

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
    <form className="d-flex flex-column gap-3" onSubmit={handleSubmit}>
      <SchemaForm spec={{ fields: formFields }} value={formState} setValue={setBoardField} />
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
  );
}
