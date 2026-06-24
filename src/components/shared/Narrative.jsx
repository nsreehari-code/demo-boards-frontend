import React from 'react';

/**
 * Reusable, read-only narrative block.
 *
 * Props:
 *   text         – narrative copy (renders the empty state when blank)
 *   emptyMessage – placeholder shown when text is empty
 */
export function Narrative({ text = '', emptyMessage = 'No narrative yet.' }) {
  if (!text) {
    return <p className="board-text-muted small fst-italic mb-0">{emptyMessage}</p>;
  }
  return <div className="small">{text}</div>;
}
