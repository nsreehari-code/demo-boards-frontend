import React from 'react';

/**
 * Full-bleed sub-view that takes over the board settings panel. Renders a
 * header with a Back control + title and the provided children as a scrollable
 * body. Closing (Back) returns to the underlying settings list — the parent
 * clears whatever state drives this pane.
 */
export function ConfigSubPane({ title, onBack, children }) {
  return (
    <div className="board-settings-subpane">
      <div className="board-settings-subpane__header">
        <button
          type="button"
          className="board-settings-subpane__back d-inline-flex align-items-center gap-1"
          onClick={onBack}
          aria-label="Back to board settings"
        >
          <i className="bi bi-chevron-left" aria-hidden="true" />
          Back
        </button>
        <div className="board-settings-subpane__title">{title}</div>
      </div>
      <div className="board-settings-subpane__body">
        {children}
      </div>
    </div>
  );
}
