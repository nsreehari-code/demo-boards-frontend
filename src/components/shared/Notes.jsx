import React, { useCallback, useEffect, useState } from 'react';

/**
 * Reusable, self-contained notes editor.
 *
 * Owns its own draft journal, the textarea, and the dirty-driven Discard / Save
 * buttons. Callers supply the externally owned `baseContent` string and an
 * `onSave` handler that decides where the committed text goes.
 *
 * Props:
 *   baseContent – externally owned content string the draft is layered on top of
 *   placeholder – textarea placeholder text
 *   onSave      – (content) => void, called on save with the effective content
 */
export function Notes({ baseContent = '', placeholder = 'Write markdown...', onSave }) {
  const [journal, setJournal] = useState(null);

  useEffect(() => {
    setJournal((current) => (current === baseContent ? null : current));
  }, [baseContent]);

  const dirty = journal != null;
  const effectiveContent = journal != null ? journal : baseContent;

  const handleChange = useCallback((event) => {
    const nextValue = event.target.value;
    setJournal(nextValue === baseContent ? null : nextValue);
  }, [baseContent]);

  const handleDiscard = useCallback(() => {
    setJournal(null);
  }, []);

  const handleSave = useCallback(() => {
    onSave?.(effectiveContent);
  }, [effectiveContent, onSave]);

  return (
    <div className="h-100 d-flex flex-column min-h-0">
      <textarea
        className="form-control form-control-sm board-textarea flex-grow-1"
        rows={8}
        placeholder={placeholder}
        value={effectiveContent}
        onChange={handleChange}
      />
      <div className="mt-2">
        <button
          type="button"
          className={`btn btn-sm btn-outline-secondary board-button me-2${dirty ? '' : ' d-none'}`}
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
