import React, { memo } from 'react';
import { useCardState } from '../hooks/useCardState.js';
import { resolveCardRenderer } from '../lib/cardPresentationConfig.js';
import { CardShell } from './CardShell.jsx';
import { IngestCard } from './IngestCard.jsx';
import { PostboxCard, UniversalPostboxCard } from './PostboxCard.jsx';
import { StrategistCard } from './StrategistCard.jsx';

function CardRendererComponent({ boardId, cardId, rendererRules = [], enableResize = false }) {
  const cardState = useCardState(boardId, cardId);

  if (!cardState?.cardContent) return null;

  switch (resolveCardRenderer(cardState, rendererRules)) {
    case 'strategist':
      return <StrategistCard boardId={boardId} cardId={cardId} enableResize={enableResize} />;
    case 'ingest':
      return <IngestCard boardId={boardId} cardId={cardId} />;
    case 'postbox':
      return <PostboxCard boardId={boardId} cardId={cardId} />;
    case 'postbox-universal':
      return <UniversalPostboxCard boardId={boardId} cardId={cardId} />;
    case 'default':
    default:
      return <CardShell boardId={boardId} cardId={cardId} enableResize={enableResize} />;
  }
}

export const CardRenderer = memo(CardRendererComponent);