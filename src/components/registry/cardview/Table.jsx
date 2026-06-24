import React, { useEffect, useState } from 'react';
import { getObjectColumns } from '../lib/fieldConfig.js';

export function Table({ spec = {}, data }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    setSortCol(null);
    setSortDir('asc');
  }, [data]);

  if (!Array.isArray(data) || !data.length) {
    return <p className="board-text-muted small mb-0">{spec.placeholder ?? 'No data'}</p>;
  }

  const limit = Math.min(data.length, spec.maxRows ?? 200);
  const columns = getObjectColumns(data.slice(0, limit), spec.columns);
  const sortable = spec.sortable !== false;

  let rows = data.slice(0, limit);
  if (sortable && sortCol !== null) {
    const sortKey = columns[sortCol];
    rows = rows.slice().sort((left, right) => {
      const leftValue = left?.[sortKey];
      const rightValue = right?.[sortKey];
      if (leftValue == null) return 1;
      if (rightValue == null) return -1;
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return sortDir === 'asc' ? leftValue - rightValue : rightValue - leftValue;
      }
      const leftText = String(leftValue);
      const rightText = String(rightValue);
      return sortDir === 'asc' ? leftText.localeCompare(rightText) : rightText.localeCompare(leftText);
    });
  }

  return (
    <div className="d-flex flex-column">
      <div className="table-responsive">
        <table className="table table-sm table-striped table-hover board-data-table">
          <thead>
            <tr>
              {columns.map((column, index) => {
                const arrow = sortCol === index ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
                return (
                  <th
                    key={column}
                    className="small text-nowrap"
                    role={sortable ? 'button' : undefined}
                    style={sortable ? { cursor: 'pointer' } : undefined}
                    onClick={sortable ? () => {
                      if (sortCol === index) {
                        setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
                      } else {
                        setSortCol(index);
                        setSortDir('asc');
                      }
                    } : undefined}
                  >
                    {column}{arrow}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((column) => (
                  <td key={column} className="small">{row?.[column] != null ? String(row[column]) : ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length > limit ? (
        <p className="board-text-muted small mt-2 mb-0">Showing {limit} of {data.length} rows</p>
      ) : null}
    </div>
  );
}

export const entry = {
  kind: 'table',
  renderComponentFn: Table,
  meta: { showLabel: true, isReadonly: true },
};
