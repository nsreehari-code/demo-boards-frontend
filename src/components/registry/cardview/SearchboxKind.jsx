import React, { useCallback } from 'react';
import { Searchbox as SharedSearchbox } from '../../shared/Searchbox.jsx';
import { getSingleFieldConfig, buildEditorSaveValue } from '../lib/fieldConfig.js';

// `searchbox` and `query` are two first-class kinds backed by the same shared
// input and the same component — the barrel registers this component under both
// kinds. The cardview keeps value loading (single-field config), the save
// destination (`buildEditorSaveValue` + `writeTo`), and the save-kind tag.
export function SearchboxKind({
  spec = {},
  data,
  currentValue,
  writeTo,
  onSave,
}) {
  const singleField = getSingleFieldConfig(spec, data, currentValue, writeTo);
  const buttonLabel = spec.actionLabel ?? 'Search';

  const handleSubmit = useCallback((nextValue) => {
    onSave?.(
      buildEditorSaveValue(writeTo, singleField?.fieldKey, nextValue),
      { kind: 'searchbox', writeTo },
    );
  }, [onSave, singleField, writeTo]);

  if (!singleField) {
    return <p className="board-text-muted small mb-0">No search field configured</p>;
  }

  return (
    <SharedSearchbox
      prop={singleField.prop ?? {}}
      fieldKey={singleField.fieldKey}
      value={singleField.currentValue}
      isRequired={singleField.isRequired}
      buttonLabel={buttonLabel}
      onSubmit={handleSubmit}
    />
  );
}

