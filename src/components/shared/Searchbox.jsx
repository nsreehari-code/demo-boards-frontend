import React, { useCallback, useEffect, useState } from 'react';

/**
 * Reusable, self-contained search input.
 *
 * Owns the local input journal, type-aware coercion, and submit handling.
 * Callers supply the already-resolved field config (`prop`, `fieldKey`,
 * `value`, `isRequired`) and an `onSubmit` handler that decides where the
 * coerced value goes.
 *
 * Props:
 *   prop        – field schema ({ type, format, minimum, maximum, title, placeholder })
 *   fieldKey    – key of the field being searched
 *   value       – externally owned current value
 *   isRequired  – whether the input is required
 *   buttonLabel – accessible label / tooltip for the submit button
 *   onSubmit    – (coercedValue) => void, called on submit
 */
export function Searchbox({ prop = {}, fieldKey, value, isRequired = false, buttonLabel = 'Search', onSubmit }) {
  const [journalValue, setJournalValue] = useState(value ?? '');

  useEffect(() => {
    setJournalValue(value ?? '');
  }, [value]);

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    if (!fieldKey) return;
    let nextValue = journalValue;
    if (prop.type === 'number' || prop.type === 'integer') {
      nextValue = journalValue === '' ? '' : Number.parseFloat(journalValue);
    }
    onSubmit?.(nextValue);
  }, [fieldKey, journalValue, onSubmit, prop.type]);

  const handleChange = useCallback((event) => {
    setJournalValue(event.target.value);
  }, []);

  return (
    <form className="input-group input-group-sm" onSubmit={handleSubmit}>
      <input
        type={prop.format === 'date' ? 'date' : (prop.type === 'number' || prop.type === 'integer' ? 'number' : 'search')}
        className="form-control board-input"
        value={prop.format === 'date' ? (journalValue != null ? String(journalValue).slice(0, 10) : '') : journalValue}
        min={prop.minimum}
        max={prop.maximum}
        step={prop.type === 'integer' ? '1' : (prop.type === 'number' ? 'any' : undefined)}
        placeholder={prop.placeholder ?? prop.title ?? fieldKey}
        aria-label={prop.title ?? fieldKey}
        required={isRequired}
        onChange={handleChange}
      />
      <button
        type="submit"
        className="btn btn-outline-secondary board-button"
        aria-label={buttonLabel}
        title={buttonLabel}
      >
        <i className="bi bi-search" aria-hidden="true" />
      </button>
    </form>
  );
}
