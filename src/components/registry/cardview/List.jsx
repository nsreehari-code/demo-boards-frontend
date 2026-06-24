import React from 'react';
import { Table } from './Table.jsx';

// `list` renders primitive arrays as a bullet list, object arrays as a Table
// (direct component reuse — no adapter), and plain objects as a definition list.
export function List({ spec = {}, data }) {
  if (data == null) return null;

  if (Array.isArray(data)) {
    if (!data.length) {
      return <p className="board-text-muted small mb-0">{spec.placeholder ?? 'Empty'}</p>;
    }
    if (typeof data[0] === 'string' || typeof data[0] === 'number') {
      const max = spec.maxRows ?? data.length;
      return (
        <ul className="list-unstyled mb-0">
          {data.slice(0, max).map((item, index) => (
            <li key={index} className="small mb-1">• {String(item)}</li>
          ))}
        </ul>
      );
    }
    return <Table spec={spec} data={data} />;
  }

  if (typeof data === 'object') {
    return (
      <dl className="row mb-0">
        {Object.entries(data).map(([key, value]) => (
          <React.Fragment key={key}>
            <dt className="col-sm-5 small board-text-muted text-truncate">{key}</dt>
            <dd className="col-sm-7 small mb-1">{value != null ? String(value) : '—'}</dd>
          </React.Fragment>
        ))}
      </dl>
    );
  }

  return <div className="small">{String(data)}</div>;
}

export const entry = {
  kind: 'list',
  renderComponentFn: List,
  meta: { showLabel: true, isReadonly: true },
};
