import React, { useCallback } from 'react';
import { Notes as SharedNotes } from '../../shared/Notes.jsx';

export function NotesKind({ data, writeTo, onSave }) {
  const baseContent = typeof data === 'string' ? data : '';

  const handleSave = useCallback((content) => {
    onSave?.(content, { kind: 'notes', writeTo });
  }, [onSave, writeTo]);

  return (
    <SharedNotes
      baseContent={baseContent}
      onSave={handleSave}
    />
  );
}
