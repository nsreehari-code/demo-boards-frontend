import React, { memo } from 'react';
import { useCardState } from '../hooks/useCardState.js';
import { resolveCardRenderer } from '../lib/cardPresentationConfig.js';
import { CardShell } from './CardShell.jsx';
import { IngestCard } from './IngestCard.jsx';
import { PasswdProtectedCardRendering } from './PasswdProtectedCardRendering.jsx';

function CardRendererComponent({ boardId, cardId, rendererRules = [], enableResize = false }) {
  const cardState = useCardState(boardId, cardId);

  if (!cardState?.cardContent) return null;

  switch (resolveCardRenderer(cardState, rendererRules)) {
    case 'ingest':
      return <IngestCard boardId={boardId} cardId={cardId} />;
    case 'protected':
    case 'passwd-protected':
    case 'password-protected':
      return <PasswdProtectedCardRendering boardId={boardId} cardId={cardId} enableResize={enableResize} />;
    case 'default':
    default:
      return <CardShell boardId={boardId} cardId={cardId} enableResize={enableResize} />;
  }
}

export const CardRenderer = memo(CardRendererComponent);