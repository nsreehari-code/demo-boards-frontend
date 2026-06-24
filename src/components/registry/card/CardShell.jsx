import React, { memo } from 'react';
import { CardChrome } from './sub/CardChrome.jsx';
import { CardviewRenderer } from '../../renderers/CardviewRenderer.jsx';

// Default card: standard card body (CardviewRenderer view-tree) inside the shared
// CardChrome. All chrome (resize, header, inspect, refresh, chat, modals) lives
// in CardChrome; this component only supplies the body.
function CardShellComponent({ spec = {} }) {
  const { boardId, cardId, enableResize = false, chrome = 'full' } = spec;
  return (
    <CardChrome boardId={boardId} cardId={cardId} chrome={chrome} enableResize={enableResize}>
      <CardviewRenderer boardId={boardId} cardId={cardId} />
    </CardChrome>
  );
}

export const CardShell = memo(CardShellComponent);
