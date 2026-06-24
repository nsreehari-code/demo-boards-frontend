import React, { useMemo } from 'react';
import { Form } from '../shared/Form.jsx';

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

const REQUIRED_KEYS = [
  'boardId',
  'label',
  'pageTitle',
  'pageSubtitle',
  'ai',
  'aiWorkspaceTemplate',
  'uiTemplate',
  'refsTemplate',
];

export function AddBoard({ onClose, onSubmit, templateOptions = [], loadingTemplates = false, submitting = false, errorMessage = '' }) {
  const spec = useMemo(() => ({
    fields: {
      properties: {
        boardId: { title: 'Board Id', placeholder: 'live-test-frontend' },
        label: { title: 'Label', placeholder: 'Live Test' },
        pageTitle: { title: 'Page Title', placeholder: 'Live Test' },
        pageSubtitle: { title: 'Page Subtitle', placeholder: 'Live operational intelligence for agent workflows' },
        ai: { title: 'AI', placeholder: 'copilot' },
        aiWorkspaceTemplate: { title: 'AI Workspace Template', placeholder: 'default' },
        uiTemplate: { title: 'UI Template', placeholder: 'default' },
        refsTemplate: { title: 'Refs Template', placeholder: 'localfs-default' },
        templateKey: {
          title: 'Card Template (optional)',
          placeholder: 'No template',
          disabled: loadingTemplates,
          options: templateOptions.map((entry) => ({ value: entry.key, label: entry.label })),
          description: loadingTemplates
            ? 'Loading templates…'
            : 'If selected, the template cards will be ingested into the newly created board.',
        },
      },
      required: REQUIRED_KEYS,
    },
    // Emptiness is owned by `required` (submit stays disabled until filled), so
    // these add the constraints `required` can't express. Format rules pass
    // through on an empty value to avoid fighting the required gating.
    validators: [
      ["data.boardId = '' or ($match(data.boardId, /^[a-z0-9-]+$/) ? true : false)", 'Board Id may only contain lowercase letters, numbers, and hyphens.'],
      ["data.boardId = '' or $length(data.boardId) >= 3", 'Board Id must be at least 3 characters.'],
    ],
  }), [templateOptions, loadingTemplates]);

  const baseValues = useMemo(() => createEmptyAddBoardForm(), []);

  const handleSave = async (values) => {
    const normalized = {
      boardId: (values.boardId ?? '').trim(),
      label: (values.label ?? '').trim(),
      pageTitle: (values.pageTitle ?? '').trim(),
      pageSubtitle: (values.pageSubtitle ?? '').trim(),
      ai: (values.ai ?? '').trim(),
      aiWorkspaceTemplate: (values.aiWorkspaceTemplate ?? '').trim(),
      uiTemplate: (values.uiTemplate ?? '').trim(),
      refsTemplate: (values.refsTemplate ?? '').trim(),
      templateKey: (values.templateKey ?? '').trim(),
    };

    try {
      await onSubmit(normalized);
    } catch {
      // Parent surfaces request failures through errorMessage.
    }
  };

  return (
    <Form
      spec={spec}
      baseValues={baseValues}
      idPrefix="add-board"
      onSave={handleSave}
      onCancel={onClose}
      submitLabel={submitting ? 'Adding…' : 'Add board'}
      submitting={submitting}
      alwaysShowActions
      error={errorMessage}
    />
  );
}
