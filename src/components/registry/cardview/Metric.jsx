import React from 'react';

// `metric` suppresses the engine frame label (entry.meta.showLabel: false) and
// uses the instance `meta.label` as a title fallback when data carries none.
export function Metric({ meta = {}, data }) {
  let title = meta.label ?? '';
  let value = '—';
  let detail = '';

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    title = data.title ?? data.label ?? data.metric ?? title;
    value = data.value != null ? String(data.value) : '—';
    detail = data.detail ?? '';
  } else if (data != null) {
    value = String(data);
  }

  return (
    <div className="board-metric">
      {title ? <div className="board-metric__label">{title}</div> : null}
      <div className="board-metric__value">{value}</div>
      {detail ? <div className="board-metric__detail">{detail}</div> : null}
    </div>
  );
}

export const entry = {
  kind: 'metric',
  renderComponentFn: Metric,
  meta: { showLabel: false, isReadonly: true },
};
