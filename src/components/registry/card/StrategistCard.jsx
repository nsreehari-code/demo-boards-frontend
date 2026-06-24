import React, { memo } from 'react';
import { CardChrome } from './sub/CardChrome.jsx';
import { CardviewRenderer } from '../../renderers/CardviewRenderer.jsx';

// Strategist card: same body as the default card (CardviewRenderer view-tree) inside the
// shared CardChrome. Registered under `card:strategist` so the renderer rules can
// route strategist cards independently; the chrome behaviour is identical.
function StrategistCardComponent({ spec = {} }) {
  const { boardId, cardId, enableResize = false, chrome = 'full' } = spec;
  return (
    <CardChrome boardId={boardId} cardId={cardId} chrome={chrome} enableResize={enableResize}>
      <CardviewRenderer boardId={boardId} cardId={cardId} />
    </CardChrome>
  );
}

export const StrategistCard = memo(StrategistCardComponent);
