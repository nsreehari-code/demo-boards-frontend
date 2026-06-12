import React, { memo, useMemo, useState } from 'react';
import { useCardState } from '../hooks/useCardState.js';
import { CardShell } from './CardShell.jsx';

function PasswdProtectedCardRenderingComponent({ boardId, cardId, enableResize = false }) {
  const cardState = useCardState(boardId, cardId);
  const [candidate, setCandidate] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [message, setMessage] = useState('');

  const title = cardState?.cardContent?.meta?.title ?? cardId;
  const configuredPassword = useMemo(() => {
    const meta = cardState?.cardContent?.meta ?? {};
    const password = meta.password ?? meta.passwd ?? meta.passphrase ?? meta.accessPassword ?? null;
    return typeof password === 'string' && password.length > 0 ? password : null;
  }, [cardState?.cardContent?.meta]);

  if (!cardState?.cardContent) return null;

  if (unlocked && configuredPassword) {
    return <CardShell boardId={boardId} cardId={cardId} enableResize={enableResize} />;
  }

  return (
    <div className="board-card-shell">
      <div className="board-card board-tone--blocked">
        <div className="board-card__header">
          <div className="board-card__title-wrap">
            <div className="board-card__title-block">
              <div className="board-card__title text-truncate">{title}</div>
              <div className="board-card__meta">
                <span className="board-status-pill board-tone--blocked">protected</span>
              </div>
            </div>
          </div>
        </div>
        <div className="board-card__body d-flex flex-column gap-3">
          <p className="small mb-0">
            {configuredPassword
              ? 'This card is protected. Enter the passphrase to reveal its contents.'
              : 'This card is marked protected, but no passphrase is configured in card metadata.'}
          </p>
          {configuredPassword ? (
            <form
              className="d-flex flex-column gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (candidate === configuredPassword) {
                  setUnlocked(true);
                  setMessage('');
                  return;
                }
                setMessage('Incorrect passphrase.');
              }}
            >
              <input
                type="password"
                className="form-control form-control-sm"
                value={candidate}
                onChange={(event) => setCandidate(event.target.value)}
                placeholder="Passphrase"
                aria-label={`Passphrase for ${title}`}
              />
              <div className="d-flex align-items-center gap-2">
                <button type="submit" className="btn btn-sm btn-outline-secondary">Unlock</button>
                {message ? <span className="small text-danger">{message}</span> : null}
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const PasswdProtectedCardRendering = memo(PasswdProtectedCardRenderingComponent);