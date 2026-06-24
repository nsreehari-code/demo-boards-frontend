import React, { useCallback, useMemo } from 'react';
import { EditableTable as SharedEditableTable } from '../../shared/EditableTable.jsx';
import { mergeRows } from '../lib/fieldConfig.js';

export function EditableTableKind({ spec = {}, data, writeTo, onSave }) {
  const baseRows = useMemo(() => mergeRows(data), [data]);

  const handleSave = useCallback((rows) => {
    onSave?.(rows, { kind: 'editable-table', writeTo });
  }, [onSave, writeTo]);

  return (
    <SharedEditableTable
      spec={spec}
      baseRows={baseRows}
      onSave={handleSave}
    />
  );
}
