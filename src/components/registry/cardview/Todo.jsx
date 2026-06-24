import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { deepEqual } from '../lib/coerce.js';
import { mergeRows } from '../lib/fieldConfig.js';

function TodoComposer({ onAdd }) {
  const [value, setValue] = useState('');

  return (
    <div className="input-group input-group-sm mt-2">
      <input
        type="text"
        className="form-control board-input"
        placeholder="Add item..."
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          const text = value.trim();
          if (!text) return;
          onAdd(text);
          setValue('');
        }}
      />
      <button
        type="button"
        className="btn btn-outline-secondary board-button"
        onClick={() => {
          const text = value.trim();
          if (!text) return;
          onAdd(text);
          setValue('');
        }}
      >
        +
      </button>
    </div>
  );
}

export function Todo({ data, writeTo, onSave }) {
  const baseItems = useMemo(() => mergeRows(data), [data]);
  const [state, setState] = useState({ currentState: baseItems, pending: mergeRows(baseItems) });

  useEffect(() => {
    setState((current) => {
      const dirty = !deepEqual(current.currentState, current.pending);
      return {
        currentState: baseItems,
        pending: dirty ? current.pending : mergeRows(baseItems),
      };
    });
  }, [baseItems]);

  const save = useCallback((nextPending) => {
    setState({ currentState: mergeRows(nextPending), pending: mergeRows(nextPending) });
    onSave?.(nextPending, { kind: 'todo', writeTo });
  }, [onSave, writeTo]);

  return (
    <div className="h-100 d-flex flex-column min-h-0">
      <div className="flex-grow-1 overflow-auto">
        {state.pending.map((item, index) => (
          <div key={index} className="d-flex align-items-center gap-2 py-2 border-bottom">
            <input
              className="form-check-input flex-shrink-0"
              type="checkbox"
              checked={!!item.done}
              onChange={(event) => {
                const next = mergeRows(state.pending);
                next[index].done = event.target.checked;
                save(next);
              }}
            />
            <span className={`small flex-grow-1${item.done ? ' text-decoration-line-through text-muted' : ''}`}>{item.text}</span>
            <button
              type="button"
              className="btn btn-sm btn-link p-0"
              style={{ color: 'var(--status-failed)' }}
              title="Remove"
              onClick={() => save(state.pending.filter((_, itemIndex) => itemIndex !== index))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <TodoComposer
        onAdd={(text) => {
          const next = [...state.pending, { text, done: false }];
          save(next);
        }}
      />
    </div>
  );
}

export const entry = {
  kind: 'todo',
  renderComponentFn: Todo,
  meta: { showLabel: true, controlled: 'commit' },
};
