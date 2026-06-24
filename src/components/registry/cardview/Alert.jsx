import React from 'react';
import { evalThreshold } from '../lib/threshold.js';

// `alert` suppresses the engine frame label (entry.meta.showLabel: false) and
// renders the instance `meta.label` inline.
export function Alert({ spec = {}, meta = {}, data }) {
  const label = meta.label;
  const thresholds = spec.thresholds ?? {};
  const value = typeof data === 'number' ? data : (data?.value ?? null);

  let level = 'unknown';
  let tone = 'board-tone--unknown';
  if (value != null) {
    if (thresholds.green && evalThreshold(value, thresholds.green)) {
      level = 'green';
      tone = 'board-tone--green';
    } else if (thresholds.amber && evalThreshold(value, thresholds.amber)) {
      level = 'amber';
      tone = 'board-tone--amber';
    } else {
      level = 'red';
      tone = 'board-tone--red';
    }
  }

  return (
    <div className={`board-alert ${tone}`}>
      <span className="board-alert__dot" />
      <div className="flex-grow-1">
        <div className="board-alert__value">{value != null ? String(value) : '—'}</div>
        {label ? <div className="board-alert__label">{label}</div> : null}
      </div>
      <span className={`board-badge ${tone}`}>{level}</span>
    </div>
  );
}

export const entry = {
  kind: 'alert',
  renderComponentFn: Alert,
  meta: { showLabel: false, isReadonly: true },
};
