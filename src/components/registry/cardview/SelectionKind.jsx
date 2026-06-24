import React, { useCallback } from 'react';
import { SelectControl } from '../../shared/Select.jsx';
import { getSingleFieldConfig, buildEditorSaveValue } from '../lib/fieldConfig.js';

export function SelectionKind({ spec = {}, data, currentValue, writeTo, onSave }) {
  const singleField = getSingleFieldConfig(spec, data, currentValue, writeTo);

  const handleSelect = useCallback((nextValue) => {
    onSave?.(
      buildEditorSaveValue(writeTo, singleField?.fieldKey, nextValue),
      { kind: 'selection', writeTo },
    );
  }, [onSave, singleField, writeTo]);

  if (!singleField) {
    return <p className="board-text-muted small mb-0">No selection configured</p>;
  }

  const { prop, fieldKey, currentValue: fieldValue, options, isRequired } = singleField;

  return (
    <form
      className="input-group input-group-sm"
      onSubmit={(event) => { event.preventDefault(); handleSelect(fieldValue ?? ''); }}
    >
      <SelectControl
        value={fieldValue}
        options={options}
        allowEmpty={!isRequired}
        emptyLabel="All"
        required={isRequired}
        ariaLabel={prop.title ?? fieldKey}
        onChange={handleSelect}
      />
    </form>
  );
}
