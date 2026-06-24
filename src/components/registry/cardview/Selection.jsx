import React, { useCallback } from 'react';
import { getSingleFieldConfig, buildEditorSaveValue } from '../lib/fieldConfig.js';

export function Selection({ spec = {}, data, currentValue, writeTo, onSave }) {
  const singleField = getSingleFieldConfig(spec, data, currentValue, writeTo);
  const fieldKey = singleField?.fieldKey;
  const fieldValue = singleField?.currentValue;

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    if (!fieldKey) return;
    onSave?.(
      buildEditorSaveValue(writeTo, fieldKey, fieldValue ?? ''),
      { kind: 'selection', writeTo },
    );
  }, [fieldValue, fieldKey, onSave, writeTo]);

  const handleChange = useCallback((event) => {
    if (!fieldKey) return;
    onSave?.(
      buildEditorSaveValue(writeTo, fieldKey, event.target.value),
      { kind: 'selection', writeTo },
    );
  }, [fieldKey, onSave, writeTo]);

  if (!singleField) {
    return <p className="board-text-muted small mb-0">No selection configured</p>;
  }

  const { prop, options, isRequired } = singleField;

  return (
    <form className="input-group input-group-sm" onSubmit={handleSubmit}>
      <select
        className="form-select board-select"
        value={fieldValue ?? ''}
        required={isRequired}
        aria-label={prop.title ?? fieldKey}
        onChange={handleChange}
      >
        {!isRequired ? <option value="">All</option> : null}
        {options.map((option) => {
          const optionValue = option != null && typeof option === 'object'
            ? String(option.value ?? option.id ?? option.label ?? '')
            : String(option ?? '');
          const optionLabel = option != null && typeof option === 'object'
            ? String(option.label ?? option.title ?? option.value ?? option.id ?? '')
            : String(option ?? '');
          return <option key={optionValue} value={optionValue}>{optionLabel}</option>;
        })}
      </select>
    </form>
  );
}

export const entry = {
  kind: 'selection',
  renderComponentFn: Selection,
  meta: { showLabel: true, controlled: 'commit' },
};
