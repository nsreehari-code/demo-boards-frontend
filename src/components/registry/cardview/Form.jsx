import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { deepEqual } from '../lib/coerce.js';

export function Form({ spec = {}, meta = {}, data, currentValue, writeTo, onSave }) {
  const id = meta.id;
  const schema = spec.fields ?? {};
  const props = schema.properties ?? {};
  const required = schema.required ?? [];
  const discardLabel = spec.discardLabel ?? 'Discard';
  const saveLabel = spec.saveLabel ?? 'Save';
  const baseValues = useMemo(() => (
    data && typeof data === 'object' && !Array.isArray(data)
      ? { ...data }
      : (currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
        ? { ...currentValue }
        : {})
  ), [data, currentValue]);

  const [journal, setJournal] = useState({});

  useEffect(() => {
    setJournal((current) => {
      const next = { ...current };
      Object.keys(next).forEach((key) => {
        if (deepEqual(next[key], baseValues[key])) delete next[key];
      });
      return next;
    });
  }, [baseValues]);

  const effectiveValues = useMemo(() => ({ ...baseValues, ...journal }), [baseValues, journal]);
  const dirty = Object.keys(journal).length > 0;

  const setFieldValue = useCallback((key, prop, rawValue) => {
    let nextValue = rawValue;
    if (prop.type === 'boolean') nextValue = !!rawValue;
    if (prop.type === 'number' || prop.type === 'integer') nextValue = rawValue === '' ? 0 : Number.parseFloat(rawValue);

    setJournal((current) => {
      const next = { ...current };
      if (deepEqual(nextValue, baseValues[key])) delete next[key];
      else next[key] = nextValue;
      return next;
    });
  }, [baseValues]);

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    onSave?.(effectiveValues, { kind: 'form', writeTo });
  }, [effectiveValues, onSave, writeTo]);

  const handleDiscard = useCallback(() => {
    setJournal({});
  }, []);

  return (
    <form className="row g-2 h-100 align-content-start" onSubmit={handleSubmit}>
      {Object.entries(props).map(([key, prop]) => {
        const isRequired = required.includes(key);
        const compact = ['number', 'integer', 'boolean'].includes(prop.type) || prop.enum || prop.format === 'date';
        const value = effectiveValues[key];
        return (
          <div key={key} className={compact ? 'col-12 col-md-6' : 'col-12'}>
            {prop.type === 'boolean' ? (
              <div className="form-check mt-3">
                <input
                  id={`${id ?? 'field'}-${key}`}
                  type="checkbox"
                  className="form-check-input"
                  checked={!!value}
                  onChange={(event) => setFieldValue(key, prop, event.target.checked)}
                />
                <label className="form-check-label small" htmlFor={`${id ?? 'field'}-${key}`}>
                  {prop.title ?? key}
                </label>
              </div>
            ) : (
              <>
                <label className="form-label small mb-1 board-text-muted">{prop.title ?? key}</label>
                {prop.enum ? (
                  <select
                    className="form-select form-select-sm board-select"
                    value={value ?? ''}
                    onChange={(event) => setFieldValue(key, prop, event.target.value)}
                    required={isRequired}
                  >
                    {prop.enum.map((option) => (
                      <option key={String(option)} value={String(option)}>{String(option)}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={prop.format === 'date' ? 'date' : (prop.type === 'number' || prop.type === 'integer' ? 'number' : 'text')}
                    className="form-control form-control-sm board-input"
                    value={prop.format === 'date' ? (value != null ? String(value).slice(0, 10) : '') : (value ?? '')}
                    min={prop.minimum}
                    max={prop.maximum}
                    step={prop.type === 'integer' ? '1' : (prop.type === 'number' ? 'any' : undefined)}
                    placeholder={prop.placeholder}
                    required={isRequired}
                    onChange={(event) => setFieldValue(key, prop, event.target.value)}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
      <div className="col-12 mt-1">
        <button
          type="button"
          className={`btn btn-sm btn-outline-secondary board-button me-2${dirty ? '' : ' d-none'}`}
          onClick={handleDiscard}
        >
          {discardLabel}
        </button>
        <button type="submit" className={`btn btn-sm btn-primary board-button${dirty ? '' : ' d-none'}`}>
          {saveLabel}
        </button>
      </div>
    </form>
  );
}

export const entry = {
  kind: 'form',
  renderComponentFn: Form,
  meta: { showLabel: true, controlled: 'commit' },
};
