import React, { useCallback, useMemo } from 'react';
import { Todo as SharedTodo } from '../../shared/Todo.jsx';
import { mergeRows } from '../lib/fieldConfig.js';

export function TodoKind({ data, writeTo, onSave }) {
  const baseItems = useMemo(() => mergeRows(data), [data]);

  const handleSave = useCallback((items) => {
    onSave?.(items, { kind: 'todo', writeTo });
  }, [onSave, writeTo]);

  return (
    <SharedTodo
      baseItems={baseItems}
      onSave={handleSave}
    />
  );
}
