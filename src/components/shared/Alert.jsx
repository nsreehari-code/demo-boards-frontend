import React from 'react';

/**
 * Reusable threshold alert tile.
 *
 * Props:
 *   value – numeric/string value to display ('—' when null)
 *   label – optional caption under the value
 *   level – severity bucket: 'green' | 'amber' | 'red' | 'unknown'
 */
export function Alert({ value = null, label = '', level = 'unknown' }) {
  const tone = `board-tone--${level}`;
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
