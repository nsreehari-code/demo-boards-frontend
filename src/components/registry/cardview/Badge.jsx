import React from 'react';

export function Badge({ spec = {}, data }) {
  const colorMap = spec.colorMap ?? {};
  const value = data != null ? String(data) : '';
  const toneKey = colorMap[value] ?? 'secondary';
  const toneMap = {
    green: 'board-tone--green',
    amber: 'board-tone--amber',
    red: 'board-tone--red',
    blue: 'board-tone--running',
    primary: 'board-tone--running',
    success: 'board-tone--green',
    warning: 'board-tone--amber',
    danger: 'board-tone--red',
    secondary: 'board-tone--secondary',
  };
  const tone = toneMap[toneKey] ?? `board-tone--${toneKey}`;
  return <span className={`board-badge ${tone}`}>{value}</span>;
}

export const entry = {
  kind: 'badge',
  renderComponentFn: Badge,
  meta: { showLabel: true, isReadonly: true },
};
