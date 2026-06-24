import React from 'react';

/**
 * Reusable, read-only metric tile.
 *
 * Props:
 *   title  – optional label above the value
 *   value  – the primary metric value (default '—')
 *   detail – optional secondary detail line
 */
export function Metric({ title = '', value = '—', detail = '' }) {
  return (
    <div className="board-metric">
      {title ? <div className="board-metric__label">{title}</div> : null}
      <div className="board-metric__value">{value}</div>
      {detail ? <div className="board-metric__detail">{detail}</div> : null}
    </div>
  );
}
