import React from 'react';

export function Narrative({ data }) {
  const text = typeof data === 'string' ? data : (data?.text ?? '');
  if (!text) {
    return <p className="board-text-muted small fst-italic mb-0">No narrative yet. Click refresh to generate.</p>;
  }
  return <div className="small">{text}</div>;
}

export const entry = {
  kind: 'narrative',
  renderComponentFn: Narrative,
  meta: { showLabel: true, isReadonly: true },
};
