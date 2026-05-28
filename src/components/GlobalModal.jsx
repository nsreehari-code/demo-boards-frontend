import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export function GlobalModal({ title, onClose, children, className = '', bodyClassName = '' }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="global-modal-backdrop board-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={`global-modal board-modal__dialog ${className}`.trim()} role="dialog" aria-modal="true">
        <div className="global-modal__header">
          <div className="global-modal__title">{title}</div>
          <button type="button" className="board-icon-button" onClick={onClose} aria-label="Close">
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <div className={`global-modal__body ${bodyClassName}`.trim()}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
