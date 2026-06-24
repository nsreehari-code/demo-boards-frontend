// Card tier resolution host. A consumer of the registry (not an entry): panes
// and the canvas call it to instantiate a card. It resolves the renderer name
// via the config-driven `resolveCardRenderer`, builds a node
// `{ kind: 'card:<renderer>', spec }` and delegates to NodeRenderer.
//
// `chrome` is presentation context supplied by the caller (full | inspect |
// bare) — it rides in spec like enableResize, never via the registry/variant.

import React, { memo } from 'react';
import { useCardState } from '../../hooks/useCardState.js';
import { resolveCardRenderer } from '../../lib/cardPresentationConfig.js';
import { NodeRenderer } from '../registry/engine/NodeRenderer.jsx';

function CardRendererComponent({ boardId, cardId, rendererRules = [], enableResize = false, chrome = 'full' }) {
  const cardState = useCardState(boardId, cardId);

  if (!cardState?.cardContent) return null;

  const renderer = resolveCardRenderer(cardState, rendererRules);
  const node = {
    kind: `card:${renderer}`,
    spec: { boardId, cardId, enableResize, chrome },
  };

  return <NodeRenderer node={node} />;
}

export const CardRenderer = memo(CardRendererComponent);
