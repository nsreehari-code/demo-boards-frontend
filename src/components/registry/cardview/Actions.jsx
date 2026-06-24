import React from 'react';

export function Actions({ spec = {}, meta = {}, data, onSave }) {
  const id = meta.id;
  const buttons = spec.buttons ?? (Array.isArray(data) ? data : []);
  if (!buttons.length) return null;

  return (
    <div className="d-flex gap-2 flex-wrap">
      {buttons.map((button) => (
        <button
          key={button.id}
          type="button"
          className={`btn btn-${button.style ?? 'outline-secondary'} btn-${button.size ?? 'sm'} board-action-button`}
          disabled={!!button.disabled}
          onClick={() => onSave?.(null, { kind: 'actions', buttonId: button.id, elemId: id })}
        >
          {button.label ?? button.id}
        </button>
      ))}
    </div>
  );
}

export const entry = {
  kind: 'actions',
  renderComponentFn: Actions,
  meta: { showLabel: true, isReadonly: false },
};
