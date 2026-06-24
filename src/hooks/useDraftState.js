import { useCallback, useEffect, useMemo, useState } from 'react';
import { deepEqual } from '../components/registry/lib/coerce.js';

/**
 * Controlled-base draft state with a local per-key journal.
 *
 * `base` is the externally-owned object (memoize it in the caller). Local edits
 * live in a journal keyed by field; `values` is `base` merged with the journal.
 * When `base` changes, journal entries that now match the new base are pruned,
 * so upstream updates reconcile cleanly without clobbering unrelated edits.
 *
 * Returns:
 *   values   – base merged with pending edits
 *   dirty    – whether any pending edits exist
 *   setField – set (or clear, when it matches base) one field's draft value
 *   discard  – drop all pending edits
 */
export function useDraftState(base, { isEqual = deepEqual } = {}) {
  const [journal, setJournal] = useState({});

  useEffect(() => {
    setJournal((current) => {
      const keys = Object.keys(current);
      if (keys.length === 0) return current;
      const next = {};
      let changed = false;
      for (const key of keys) {
        if (isEqual(current[key], base?.[key])) {
          changed = true;
          continue;
        }
        next[key] = current[key];
      }
      return changed ? next : current;
    });
  }, [base, isEqual]);

  const values = useMemo(() => ({ ...base, ...journal }), [base, journal]);
  const dirty = Object.keys(journal).length > 0;

  const setField = useCallback((key, value) => {
    setJournal((current) => {
      const next = { ...current };
      if (isEqual(value, base?.[key])) delete next[key];
      else next[key] = value;
      return next;
    });
  }, [base, isEqual]);

  const discard = useCallback(() => setJournal({}), []);

  return { values, dirty, setField, discard };
}
