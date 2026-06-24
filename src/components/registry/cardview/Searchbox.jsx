import React, { useCallback, useEffect, useState } from 'react';
import { getSingleFieldConfig, buildEditorSaveValue } from '../lib/fieldConfig.js';

// `searchbox` kind. Intentionally a duplicate of QueryView.jsx (two first-class
// kinds, no alias / normalization).
export function Searchbox({ spec = {}, data, currentValue, writeTo, onSave }) {
  const singleField = getSingleFieldConfig(spec, data, currentValue, writeTo);
  const fieldKey = singleField?.fieldKey;
  const prop = singleField?.prop ?? {};
  const fieldValue = singleField?.currentValue;
  const isRequired = singleField?.isRequired;
  const buttonLabel = spec.actionLabel ?? 'Search';

  const [journalValue, setJournalValue] = useState(fieldValue ?? '');

  useEffect(() => {
    setJournalValue(fieldValue ?? '');
  }, [fieldValue]);

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    if (!fieldKey) return;
    let nextValue = journalValue;
    if (prop.type === 'number' || prop.type === 'integer') {
      nextValue = journalValue === '' ? '' : Number.parseFloat(journalValue);
    }
    onSave?.(
      buildEditorSaveValue(writeTo, fieldKey, nextValue),
      { kind: 'searchbox', writeTo },
    );
  }, [fieldKey, journalValue, onSave, prop.type, writeTo]);

  const handleChange = useCallback((event) => {
    setJournalValue(event.target.value);
  }, []);

  if (!singleField) {
    return <p className="board-text-muted small mb-0">No search field configured</p>;
  }

  return (
    <form className="input-group input-group-sm" onSubmit={handleSubmit}>
      <input
        type={prop.format === 'date' ? 'date' : (prop.type === 'number' || prop.type === 'integer' ? 'number' : 'search')}
        className="form-control board-input"
        value={prop.format === 'date' ? (journalValue != null ? String(journalValue).slice(0, 10) : '') : journalValue}
        min={prop.minimum}
        max={prop.maximum}
        step={prop.type === 'integer' ? '1' : (prop.type === 'number' ? 'any' : undefined)}
        placeholder={prop.placeholder ?? prop.title ?? fieldKey}
        aria-label={prop.title ?? fieldKey}
        required={isRequired}
        onChange={handleChange}
      />
      <button
        type="submit"
        className="btn btn-outline-secondary board-button"
        aria-label={buttonLabel}
        title={buttonLabel}
      >
        <i className="bi bi-search" aria-hidden="true" />
      </button>
    </form>
  );
}

export const entry = {
  kind: 'searchbox',
  renderComponentFn: Searchbox,
  meta: { showLabel: true, controlled: 'commit' },
};
