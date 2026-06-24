import React from 'react';

/**
 * Reusable button row.
 *
 * Props:
 *   buttons  – [{ id, label?, style?, size?, disabled? }]
 *   onAction – (buttonId) => void, fired on click
 */
export function Actions({ buttons = [], onAction }) {
  if (!buttons.length) return null;

  return (
    <div className="d-flex gap-2 flex-wrap">
      {buttons.map((button) => (
        <button
          key={button.id}
          type="button"
          className={`btn btn-${button.style ?? 'outline-secondary'} btn-${button.size ?? 'sm'} board-action-button`}
          disabled={!!button.disabled}
          onClick={() => onAction?.(button.id)}
        >
          {button.label ?? button.id}
        </button>
      ))}
    </div>
  );
}
