import React, { useCallback, useMemo } from 'react';
import { getObjectColumns, mergeRows } from '../registry/lib/fieldConfig.js';
import { useDraftState } from '../../hooks/useDraftState.js';

/**
 * Reusable, self-contained editable table.
 *
 * Owns its own draft state (via `useDraftState`), column derivation, row
 * add/edit/delete behaviour, and the dirty-driven Discard / Save buttons (plus
 * the optional "Add row" button).
 *
 * Callers supply the schema (`spec`), the externally owned base rows
 * (`baseRows`, memoize in the caller), and an `onSave` handler that decides
 * where the committed rows go.
 *
 * Props:
 *   spec     – { schema: { properties }, columns?, addRow?, deleteRow?, placeholder? }
 *   baseRows – externally owned rows array the draft is layered on top of
 *   onSave   – (rows) => void, called on save with the merged draft rows
 */
export function EditableTable({ spec = {}, baseRows = [], onSave }) {
  const schemaProps = spec.schema?.properties ?? {};
  const canAdd = spec.addRow !== false;
  const canDelete = spec.deleteRow !== false;
  const base = useMemo(() => ({ rows: mergeRows(baseRows) }), [baseRows]);
  const { values, dirty, setField, discard: handleDiscard } = useDraftState(base);

  const effectiveRows = mergeRows(values.rows);
  const columns = getObjectColumns(effectiveRows, spec.columns);

  const updateRows = useCallback((nextRows) => {
    setField('rows', mergeRows(nextRows));
  }, [setField]);

  const handleAddRow = useCallback(() => {
    const nextRow = {};
    columns.forEach((column) => {
      nextRow[column] = '';
    });
    updateRows([...effectiveRows, nextRow]);
  }, [columns, effectiveRows, updateRows]);

  const handleSave = useCallback(() => {
    onSave?.(effectiveRows);
  }, [effectiveRows, onSave]);

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
