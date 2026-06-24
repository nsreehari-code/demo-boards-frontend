import React, { useEffect, useState } from 'react';

/**
 * Normalize a single option (scalar or { value/id/label/title } object) into a
 * `{ value, label }` pair of strings.
 */
export function normalizeOption(option) {
  if (option != null && typeof option === 'object') {
    return {
      value: String(option.value ?? option.id ?? option.label ?? ''),
      label: String(option.label ?? option.title ?? option.value ?? option.id ?? ''),
    };
  }
  const scalar = String(option ?? '');
  return { value: scalar, label: scalar };
}

/**
 * Resolve a select's options from either a static `options` array or a
 * `getOptions` source (array | sync fn | async fn). When `getOptions` is
 * provided it takes precedence; async sources surface a transient `loading`
 * flag. Memoize a function/array `getOptions` in the caller so it does not
 * re-resolve on every render.
 */
export function useResolvedOptions(options, getOptions) {
  const [resolved, setResolved] = useState(() => (getOptions == null ? (options ?? []) : []));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getOptions == null) {
      setResolved(options ?? []);
      setLoading(false);
      return undefined;
    }

    const source = typeof getOptions === 'function' ? getOptions() : getOptions;

    if (source && typeof source.then === 'function') {
      let cancelled = false;
      setLoading(true);
      Promise.resolve(source)
        .then((result) => {
          if (cancelled) return;
          setResolved(Array.isArray(result) ? result : []);
          setLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setResolved([]);
          setLoading(false);
        });
      return () => { cancelled = true; };
    }

    setResolved(Array.isArray(source) ? source : []);
    setLoading(false);
    return undefined;
  }, [getOptions, options]);

  return { options: resolved, loading };
}

/**
 * Presentational single-select control (no surrounding form). Resolves options
 * (static or via `getOptions`), normalizes object options, and optionally
 * renders a leading empty option.
 *
 * Props:
 *   id, className, value, required, disabled, ariaLabel, title
 *   options    – static array of scalars or { value/id/label/title } objects
 *   getOptions – array | () => array | () => Promise<array>; takes precedence
 *   allowEmpty – render a leading empty option
 *   emptyLabel – label for the empty option
 *   onChange   – (value) => void
 */
export function SelectControl({
  id,
  className = 'form-select board-select',
  value,
  options = [],
  getOptions,
  allowEmpty = false,
  emptyLabel = '',
  required = false,
  disabled = false,
  ariaLabel,
  title,
  onChange,
}) {
  const { options: resolvedOptions, loading } = useResolvedOptions(options, getOptions);

  return (
    <select
      id={id}
      className={className}
      value={value ?? ''}
      required={required}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      title={title}
      aria-busy={loading || undefined}
      onChange={(event) => onChange?.(event.target.value)}
    >
      {loading ? (
        <option value="">Loading…</option>
      ) : (
        <>
          {allowEmpty ? <option value="">{emptyLabel}</option> : null}
          {resolvedOptions.map((option) => {
            const { value: optionValue, label } = normalizeOption(option);
            return <option key={optionValue} value={optionValue}>{label}</option>;
          })}
        </>
      )}
    </select>
  );
}
