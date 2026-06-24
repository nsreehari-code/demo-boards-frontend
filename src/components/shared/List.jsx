import React from 'react';
import { Table } from './Table.jsx';

/**
 * Reusable, read-only renderer for arbitrary data:
 *   - primitive arrays  → bullet list
 *   - object arrays      → shared Table (direct reuse)
 *   - plain objects      → definition list
 *   - scalars            → plain text
 *
 * Props:
 *   data             – the value to render
 *   columns          – optional explicit columns for the object-array Table
 *   maxRows          – cap on rendered rows
 *   sortable         – enable Table sorting (default true)
 *   placeholder      – text shown for an empty array
 *   tablePlaceholder – placeholder forwarded to the Table branch
 */
export function List({
  data,
  columns,
  maxRows,
  sortable = true,
  placeholder = 'Empty',
  tablePlaceholder = 'No data',
}) {
  if (data == null) return null;

  if (Array.isArray(data)) {
    if (!data.length) {
      return <p className="board-text-muted small mb-0">{placeholder}</p>;
    }
    if (typeof data[0] === 'string' || typeof data[0] === 'number') {
      const max = maxRows ?? data.length;
      return (
        <ul className="list-unstyled mb-0">
          {data.slice(0, max).map((item, index) => (
            <li key={index} className="small mb-1">• {String(item)}</li>
          ))}
        </ul>
      );
    }
    return <Table data={data} columns={columns} maxRows={maxRows} sortable={sortable} placeholder={tablePlaceholder} />;
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
