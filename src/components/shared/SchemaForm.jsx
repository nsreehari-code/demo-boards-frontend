import React from 'react';

/**
 * Declarative, controlled form that renders a flat list of settings-style
 * fields from a spec. Presentational only: the parent owns `value` and applies
 * each edit via `setValue(key, nextValue)`.
 *
 * spec.fields: array of field descriptors:
 *   { key, label, type?, placeholder?, options?, hint?, disabled?, min?, step? }
 *   - type: 'text' (default) | 'number' | 'select'
 *   - options (select only): array of { value, label } or primitive values
 *   - hint: optional helper text rendered under the control
 *   - disabled: per-field disable (combined with the form-wide `disabled`)
 *
 * value:    object keyed by field.key
 * setValue: (key, nextValue) => void
 * disabled: form-wide disable applied to every field
 */
export function SchemaForm({ spec = {}, value = {}, setValue, disabled = false }) {
  const fields = Array.isArray(spec.fields) ? spec.fields : [];

  return (
    <>
      {fields.map((field) => {
        const fieldDisabled = disabled || !!field.disabled;
        const fieldValue = value[field.key] ?? '';
        const handleChange = (event) => setValue?.(field.key, event.target.value);

        return (
          <label key={field.key} className="board-settings-field mb-0">
            <span>{field.label}</span>
            {field.type === 'select' ? (
              <select className="board-input" value={fieldValue} onChange={handleChange} disabled={fieldDisabled}>
                {normalizeOptions(field.options).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            ) : (
              <input
                className="board-input"
                type={field.type === 'number' ? 'number' : 'text'}
                value={fieldValue}
                onChange={handleChange}
                placeholder={field.placeholder}
                disabled={fieldDisabled}
                {...(field.type === 'number' ? { min: field.min, step: field.step } : {})}
              />
            )}
            {field.hint ? (
              <div className="board-settings-form__hint">{field.hint}</div>
            ) : null}
          </label>
        );
      })}
    </>
  );
}

function normalizeOptions(options) {
  if (!Array.isArray(options)) return [];
  return options.map((option) => (
    option && typeof option === 'object'
      ? { value: option.value ?? '', label: option.label ?? String(option.value ?? '') }
      : { value: option, label: String(option) }
  ));
}
