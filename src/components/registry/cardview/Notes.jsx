import React, { useCallback, useEffect, useState } from 'react';

export function Notes({ data, writeTo, onSave }) {
  const baseContent = typeof data === 'string' ? data : '';
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
    onSave?.(effectiveContent, { kind: 'notes', writeTo });
  }, [effectiveContent, onSave, writeTo]);

  return (
    <div className="h-100 d-flex flex-column min-h-0">
      <textarea
        className="form-control form-control-sm board-textarea flex-grow-1"
        rows={8}
        placeholder="Write markdown..."
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

export const entry = {
  kind: 'notes',
  renderComponentFn: Notes,
  meta: { showLabel: true, controlled: 'commit' },
};
