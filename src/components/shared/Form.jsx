import React, { useCallback, useMemo, useState } from 'react';
import { compileSync } from 'yaml-flow/compute-jsonata';
import { useDraftState } from '../../hooks/useDraftState.js';
import { SelectControl, normalizeOption } from './Select.jsx';

/**
 * Build a `{ value, label }` options array for a single-select field from the
 * supported spec shapes, in priority order:
 *   - `oneOf: [{ const, title }]`        (JSON Schema labeled enum)
 *   - `options: [...]`                   (scalars or { value/id/label/title })
 *   - `enum` (+ optional parallel `enumNames`)
 * Returns null when the field is not a (static) select.
 */
function buildFieldOptions(prop) {
  if (Array.isArray(prop.oneOf)) {
    return prop.oneOf.map((item) => ({ value: item.const, label: item.title ?? String(item.const) }));
  }
  if (Array.isArray(prop.options)) return prop.options;
  if (Array.isArray(prop.enum)) {
    if (Array.isArray(prop.enumNames) && prop.enumNames.length === prop.enum.length) {
      return prop.enum.map((value, index) => ({ value, label: prop.enumNames[index] }));
    }
    return prop.enum;
  }
  return null;
}

/** Build options for a multi-select (`type: 'array'`) field. */
function buildMultiOptions(prop) {
  const items = prop.items ?? {};
  if (Array.isArray(items.oneOf)) {
    return items.oneOf.map((item) => ({ value: item.const, label: item.title ?? String(item.const) }));
  }
  if (Array.isArray(prop.options)) return prop.options;
  if (Array.isArray(items.enum)) {
    if (Array.isArray(items.enumNames) && items.enumNames.length === items.enum.length) {
      return items.enum.map((value, index) => ({ value, label: items.enumNames[index] }));
    }
    return items.enum;
  }
  return [];
}

const isMultiSelect = (prop) => prop.type === 'array'
  && (Array.isArray(prop.items?.enum) || Array.isArray(prop.items?.oneOf) || Array.isArray(prop.options));
const isSelect = (prop) => prop.getOptions != null || buildFieldOptions(prop) != null;
const isTextarea = (prop) => prop.format === 'textarea' || prop.multiline === true;

function inputTypeFor(prop) {
  if (prop.format === 'date') return 'date';
  if (prop.format === 'time') return 'time';
  if (prop.format === 'date-time' || prop.format === 'datetime') return 'datetime-local';
  if (prop.type === 'number' || prop.type === 'integer') return 'number';
  return 'text';
}

function formatTemporalValue(prop, value) {
  if (value == null) return '';
  const text = String(value);
  if (prop.format === 'date') return text.slice(0, 10);
  if (prop.format === 'date-time' || prop.format === 'datetime') return text.slice(0, 16);
  if (prop.format === 'time') return text.slice(0, 5);
  return text;
}

/**
 * Reusable, self-contained schema form.
 *
 * Owns its own draft state (via `useDraftState`), field coercion, rendering of
 * the supported field types, and the dirty-driven Discard / Save buttons.
 *
 * Supported field shapes (JSON-Schema-ish `spec.fields.properties.<key>`):
 *   - text / number / integer            – text or numeric input
 *   - boolean                            – checkbox
 *   - format: 'date' | 'time' | 'date-time'
 *   - format: 'textarea' or multiline:true – textarea
 *   - single-select: `enum` (+ optional `enumNames`), `oneOf:[{const,title}]`,
 *     `options:[scalar|{value,label}]`, or a runtime `getOptions`
 *     (array | sync fn | async fn) — delegated to the shared SelectControl
 *   - multi-select: `type:'array'` with `items.enum` / `items.oneOf` / `options`
 *   Per-field extras: `title`, `description`/`hint`, `placeholder`,
 *   `minimum`/`maximum`, `minLength`/`maxLength`/`pattern`, `readOnly`/`disabled`,
 *   and `colSpan` (1–12) to control grid width.
 *
 * Props:
 *   spec       – { fields: { properties, required }, discardLabel?, saveLabel?,
 *                  validators? }. `validators` is [[jsonataExpr, errorMessage], …];
 *                  each expr is evaluated against { data: values } and must return
 *                  true to pass (else its errorMessage is shown). Validation runs
 *                  on blur and submit — not per keystroke.
 *   baseValues – externally owned values object the draft is layered on top of
 *   idPrefix   – prefix used for generated input/label element ids
 *   onSave     – (values) => void, called on submit with the merged draft values
 *
 * Footer props (default = commit mode: dirty-gated Discard / Save, no Cancel):
 *   onCancel          – () => void; when set, renders a Cancel button
 *   cancelLabel       – label for the Cancel button (default 'Cancel')
 *   submitLabel       – label for the submit button (default spec.saveLabel ?? 'Save')
 *   submitting        – disables Cancel + submit (e.g. while a request is in flight)
 *   canSubmit         – extra gate; submit is disabled when false (default true)
 *   alwaysShowActions – create mode: always show the submit button (and hide the
 *                       dirty-gated Discard), gating submit on required-field
 *                       completeness instead of dirtiness
 *   error             – message rendered alongside the footer actions
 */
export function Form({
  spec = {},
  baseValues = {},
  idPrefix = 'field',
  onSave,
  onCancel = null,
  cancelLabel = 'Cancel',
  submitLabel,
  submitting = false,
  canSubmit = true,
  alwaysShowActions = false,
  error = '',
}) {
  const schema = spec.fields ?? {};
  const props = schema.properties ?? {};
  const required = schema.required ?? [];
  const discardLabel = spec.discardLabel ?? 'Discard';
  const saveLabel = submitLabel ?? spec.saveLabel ?? 'Save';

  const { values: effectiveValues, dirty, setField, discard: handleDiscard } = useDraftState(baseValues);

  const requiredComplete = required.every((key) => {
    const value = effectiveValues[key];
    if (value == null) return false;
    return typeof value === 'string' ? value.trim() !== '' : true;
  });

  // Validators are JSONata `[expr, message]` pairs from `spec.validators`,
  // precompiled once. Each expr is evaluated against { data: values } and must
  // return true to pass. Validation runs on blur (a field losing focus) and on
  // submit — not per keystroke — so an expensive expression stays cheap. Results
  // are held in state; `checked` stays false until the first run.
  const compiledValidators = useMemo(() => {
    const list = Array.isArray(spec.validators) ? spec.validators : [];
    return list.reduce((acc, entry) => {
      const [expr, message] = Array.isArray(entry) ? entry : [];
      if (typeof expr !== 'string' || !expr.trim()) return acc;
      try {
        acc.push({ expr: compileSync(expr), message: message ?? 'Invalid value' });
      } catch {
        // Skip an un-compilable expression rather than break the whole form.
      }
      return acc;
    }, []);
  }, [spec.validators]);

  const [validation, setValidation] = useState({ checked: false, isValid: true, errors: [] });
  const runValidation = useCallback((values) => {
    if (!compiledValidators.length) return true;
    const root = { data: values };
    const errors = [];
    for (const validator of compiledValidators) {
      let ok = false;
      try {
        ok = validator.expr.evaluate(root) === true;
      } catch {
        ok = false;
      }
      if (!ok) errors.push(validator.message);
    }
    setValidation({ checked: true, isValid: errors.length === 0, errors });
    return errors.length === 0;
  }, [compiledValidators]);
  const validationErrors = validation.errors;
  const submitDisabled = submitting || !canSubmit
    || (validation.checked && !validation.isValid)
    || (alwaysShowActions && !requiredComplete);

  const setFieldValue = useCallback((key, prop, rawValue) => {
    let nextValue = rawValue;
    if (prop.type === 'boolean') {
      nextValue = !!rawValue;
    } else if (prop.type === 'number' || prop.type === 'integer') {
      nextValue = rawValue === '' ? 0 : Number.parseFloat(rawValue);
    } else if (prop.type === 'array') {
      const itemType = prop.items?.type;
      const list = Array.isArray(rawValue) ? rawValue : [];
      nextValue = (itemType === 'number' || itemType === 'integer')
        ? list.map((entry) => (entry === '' ? 0 : Number.parseFloat(entry)))
        : list;
    }
    setField(key, nextValue);
  }, [setField]);

  const handleSubmit = useCallback((event) => {
    event.preventDefault();
    if (!runValidation(effectiveValues)) return;
    onSave?.(effectiveValues);
  }, [effectiveValues, onSave, runValidation]);

  return (
    <form
      className="row g-2 h-100 align-content-start"
      onSubmit={handleSubmit}
      onBlur={compiledValidators.length ? () => runValidation(effectiveValues) : undefined}
    >
      {Object.entries(props).map(([key, prop]) => {
        const id = `${idPrefix}-${key}`;
        const isRequired = required.includes(key);
        const fieldDisabled = !!(prop.readOnly || prop.disabled);
        const hint = prop.description ?? prop.hint;
        const value = effectiveValues[key];

        if (prop.type === 'boolean') {
          const colClass = prop.colSpan ? `col-12 col-md-${prop.colSpan}` : 'col-12 col-md-6';
          return (
            <div key={key} className={colClass}>
              <div className="form-check mt-3">
                <input
                  id={id}
                  type="checkbox"
                  className="form-check-input"
                  checked={!!value}
                  disabled={fieldDisabled}
                  onChange={(event) => setFieldValue(key, prop, event.target.checked)}
                />
                <label className="form-check-label small" htmlFor={id}>
                  {prop.title ?? key}
                </label>
                {hint ? <div className="form-text small board-text-muted">{hint}</div> : null}
              </div>
            </div>
          );
        }

        const compact = ['number', 'integer'].includes(prop.type)
          || isSelect(prop) || isMultiSelect(prop)
          || ['date', 'time', 'date-time', 'datetime'].includes(prop.format);
        const colClass = prop.colSpan
          ? `col-12 col-md-${prop.colSpan}`
          : (compact && !isTextarea(prop) ? 'col-12 col-md-6' : 'col-12');

        let control;
        if (isMultiSelect(prop)) {
          const options = buildMultiOptions(prop);
          const selected = Array.isArray(value) ? value.map(String) : [];
          control = (
            <select
              id={id}
              className="form-select form-select-sm board-select"
              multiple
              value={selected}
              required={isRequired}
              disabled={fieldDisabled}
              aria-label={prop.title ?? key}
              onChange={(event) => {
                const next = Array.from(event.target.selectedOptions).map((option) => option.value);
                setFieldValue(key, prop, next);
              }}
            >
              {options.map((option) => {
                const { value: optionValue, label } = normalizeOption(option);
                return <option key={optionValue} value={optionValue}>{label}</option>;
              })}
            </select>
          );
        } else if (isSelect(prop)) {
          control = (
            <SelectControl
              id={id}
              className="form-select form-select-sm board-select"
              value={value}
              options={buildFieldOptions(prop) ?? []}
              getOptions={prop.getOptions}
              allowEmpty={!isRequired}
              emptyLabel={prop.placeholder ?? ''}
              required={isRequired}
              disabled={fieldDisabled}
              ariaLabel={prop.title ?? key}
              onChange={(next) => setFieldValue(key, prop, next)}
            />
          );
        } else if (isTextarea(prop)) {
          control = (
            <textarea
              id={id}
              className="form-control form-control-sm board-input"
              rows={prop.rows ?? 4}
              value={value ?? ''}
              placeholder={prop.placeholder}
              required={isRequired}
              readOnly={fieldDisabled}
              minLength={prop.minLength}
              maxLength={prop.maxLength}
              onChange={(event) => setFieldValue(key, prop, event.target.value)}
            />
          );
        } else {
          const inputType = inputTypeFor(prop);
          const temporal = ['date', 'time', 'datetime-local'].includes(inputType);
          const isText = inputType === 'text';
          control = (
            <input
              id={id}
              type={inputType}
              className="form-control form-control-sm board-input"
              value={temporal ? formatTemporalValue(prop, value) : (value ?? '')}
              min={prop.minimum}
              max={prop.maximum}
              step={prop.type === 'integer' ? '1' : (prop.type === 'number' ? 'any' : undefined)}
              placeholder={prop.placeholder}
              required={isRequired}
              readOnly={fieldDisabled}
              minLength={isText ? prop.minLength : undefined}
              maxLength={isText ? prop.maxLength : undefined}
              pattern={isText ? prop.pattern : undefined}
              onChange={(event) => setFieldValue(key, prop, event.target.value)}
            />
          );
        }

        return (
          <div key={key} className={colClass}>
            <label className="form-label small mb-1 board-text-muted" htmlFor={id}>{prop.title ?? key}</label>
            {control}
            {hint ? <div className="form-text small board-text-muted">{hint}</div> : null}
          </div>
        );
      })}
      <div className={`col-12 mt-1 d-flex align-items-center gap-2${alwaysShowActions ? ' justify-content-end' : ''}`}>
        {error || validationErrors.length ? (
          <div className="board-settings-form__hint text-danger me-auto">
            {error ? <div>{error}</div> : null}
            {validationErrors.map((message, index) => (
              <div key={index}>{message}</div>
            ))}
          </div>
        ) : null}
        {onCancel ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary board-button"
            onClick={onCancel}
            disabled={submitting}
          >
            {cancelLabel}
          </button>
        ) : null}
        {dirty && !alwaysShowActions ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary board-button"
            onClick={handleDiscard}
          >
            {discardLabel}
          </button>
        ) : null}
        {alwaysShowActions || dirty ? (
          <button type="submit" className="btn btn-sm btn-primary board-button" disabled={submitDisabled}>
            {saveLabel}
          </button>
        ) : null}
      </div>
    </form>
  );
}
