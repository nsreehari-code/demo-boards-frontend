import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { deepEqual } from '../lib/coerce.js';
import { getObjectColumns, mergeRows } from '../lib/fieldConfig.js';

export function EditableTable({ spec = {}, data, writeTo, onSave }) {
  const schemaProps = spec.schema?.properties ?? {};
  const canAdd = spec.addRow !== false;
  const canDelete = spec.deleteRow !== false;
  const baseRows = useMemo(() => mergeRows(data), [data]);
  const [journalRows, setJournalRows] = useState(null);

  useEffect(() => {
    setJournalRows((current) => (Array.isArray(current) && deepEqual(current, baseRows) ? null : current));
  }, [baseRows]);

  const dirty = Array.isArray(journalRows);
  const effectiveRows = dirty ? mergeRows(journalRows) : mergeRows(baseRows);
  const columns = getObjectColumns(effectiveRows, spec.columns);

  const updateRows = useCallback((nextRows) => {
    setJournalRows(deepEqual(nextRows, baseRows) ? null : mergeRows(nextRows));
  }, [baseRows]);

  const handleAddRow = useCallback(() => {
    const nextRow = {};
    columns.forEach((column) => {
      nextRow[column] = '';
    });
    updateRows([...effectiveRows, nextRow]);
  }, [columns, effectiveRows, updateRows]);

  const handleDiscard = useCallback(() => {
    setJournalRows(null);
  }, []);

  const handleSave = useCallback(() => {
    onSave?.(effectiveRows, { kind: 'editable-table', writeTo });
  }, [effectiveRows, onSave, writeTo]);

  return (
    <div className="h-100 d-flex flex-column min-h-0">
      {(!columns.length && !canAdd) ? (
        <p className="board-text-muted small mb-0">{spec.placeholder ?? 'No data'}</p>
      ) : (
        <div className="table-responsive flex-grow-1 min-h-0">
          <table className="table table-sm table-bordered mb-0 board-data-table">
            <thead>
              <tr>
                {columns.map((column) => <th key={column} className="small text-nowrap">{column}</th>)}
                {canDelete ? <th style={{ width: '2rem' }} /> : null}
              </tr>
            </thead>
            <tbody>
              {effectiveRows.length ? effectiveRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((column) => {
                    const prop = schemaProps[column] ?? {};
                    const isNumber = prop.type === 'number' || prop.type === 'integer' || typeof row?.[column] === 'number';
                    return (
                      <td key={column} className="p-0">
                        <input
                          type={isNumber ? 'number' : 'text'}
                          className="form-control form-control-sm board-input border-0 rounded-0"
                          value={row?.[column] ?? ''}
                          step={isNumber ? 'any' : undefined}
                          onChange={(event) => {
                            const nextRows = mergeRows(effectiveRows);
                            nextRows[rowIndex][column] = isNumber
                              ? (event.target.value === '' ? 0 : Number.parseFloat(event.target.value))
                              : event.target.value;
                            updateRows(nextRows);
                          }}
                        />
                      </td>
                    );
                  })}
                  {canDelete ? (
                    <td className="text-center align-middle p-0">
                      <button
                        type="button"
                        className="btn btn-sm btn-link p-0"
                        style={{ color: 'var(--status-failed)' }}
                        title="Remove row"
                        onClick={() => updateRows(effectiveRows.filter((_, index) => index !== rowIndex))}
                      >
                        ✕
                      </button>
                    </td>
                  ) : null}
                </tr>
              )) : (
                <tr>
                  <td colSpan={columns.length + (canDelete ? 1 : 0)} className="board-text-muted small text-center">
                    {spec.placeholder ?? 'No rows'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-1">
        {canAdd ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary board-button me-1"
            onClick={handleAddRow}
          >
            + Add row
          </button>
        ) : null}
        <button
          type="button"
          className={`btn btn-sm btn-outline-secondary board-button me-1${dirty ? '' : ' d-none'}`}
          onClick={handleDiscard}
        >
          Discard
        </button>
        <button
          type="button"
          className={`btn btn-sm btn-primary board-button${dirty ? '' : ' d-none'}`}
          onClick={handleSave}
        >
          Save
        </button>
      </div>
    </div>
  );
}

export const entry = {
  kind: 'editable-table',
  renderComponentFn: EditableTable,
  meta: { showLabel: true, controlled: 'commit' },
};
