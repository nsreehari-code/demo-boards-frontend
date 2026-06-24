import React, { useEffect, useState } from 'react';
import { getObjectColumns } from '../registry/lib/fieldConfig.js';

/**
 * Reusable, read-only data table with click-to-sort columns.
 *
 * Props:
 *   data        – array of row objects
 *   columns     – optional explicit column list (else derived from data)
 *   maxRows     – cap on rendered rows (default 200)
 *   sortable    – enable column sorting (default true)
 *   placeholder – text shown when data is empty
 */
export function Table({ data, columns: columnsSpec, maxRows = 200, sortable = true, placeholder = 'No data' }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    setSortCol(null);
    setSortDir('asc');
  }, [data]);

  if (!Array.isArray(data) || !data.length) {
    return <p className="board-text-muted small mb-0">{placeholder}</p>;
  }

  const limit = Math.min(data.length, maxRows);
  const columns = getObjectColumns(data.slice(0, limit), columnsSpec);

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
