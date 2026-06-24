import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * ChallengeConfirmModal — overlay that requires the user to solve a small
 * arithmetic challenge before a destructive action proceeds.
 *
 * Props:
 *   message   – plain-text description of what will happen on confirm
 *   onConfirm – called when the user answers correctly and clicks Confirm
 *   onCancel  – called when the user dismisses without confirming
 */
export function ChallengeConfirmModal({ message, onConfirm, onCancel }) {
  const [a, b] = useMemo(() => [
    Math.floor(Math.random() * 8),      // 0 – 7
    Math.floor(Math.random() * 6) + 4,  // 4 – 9
  ], []);
  const expected = a + b;

  const [answer, setAnswer] = useState('');
  const inputRef = useRef(null);
  const onCancelRef = useRef(onCancel);
  useEffect(() => { onCancelRef.current = onCancel; });

  const answered = answer.trim() !== '';
  const isCorrect = answered && parseInt(answer, 10) === expected;

  // Run once on mount: focus the input and attach the Escape listener.
  // onCancelRef ensures the handler is never stale without re-running the effect.
  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (e) => { if (e.key === 'Escape') onCancelRef.current(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isCorrect) onConfirm();
  };

  return (
    <div
      className="board-modal position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{ zIndex: 1300, padding: '1rem' }}
      onClick={onCancel}
    >
      <div
        className="board-modal__dialog w-100"
        style={{ maxWidth: '380px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="board-modal__header d-flex align-items-center justify-content-between gap-2 px-3 py-3">
          <div className="board-modal__title">Confirm action</div>
          <button type="button" className="board-icon-button" onClick={onCancel} title="Cancel">
            <i className="bi bi-x-lg" />
          </button>
        </div>

        <div className="board-modal__body p-3 d-flex flex-column gap-3" style={{ height: 'auto' }}>
          <p className="mb-0" style={{ fontSize: '0.85rem' }}>{message}</p>

          <p className="mb-0" style={{ fontSize: '0.82rem', opacity: 0.75 }}>
            Solve to confirm:&nbsp;
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
              {a} + {b} = ?
            </strong>
          </p>

          <form onSubmit={handleSubmit} className="d-flex flex-column gap-2">
            <input
              ref={inputRef}
              className={`board-input${answered && !isCorrect ? ' board-input--error' : ''}`}
              type="number"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Enter the sum…"
              autoComplete="off"
            />
            <p className="mb-0" style={{ fontSize: '0.78rem', color: 'var(--color-error, #e05a5a)', visibility: answered && !isCorrect ? 'visible' : 'hidden' }}>
              Incorrect — try again.
            </p>
            <div className="d-flex gap-2 justify-content-end mt-1">
              <button type="button" className="btn btn-outline-secondary board-button" onClick={onCancel}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary board-button" disabled={!isCorrect}>
                Confirm
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
