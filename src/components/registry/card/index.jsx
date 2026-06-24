// Tier-2 card surface. This barrel is the card tier's single public face:
//   - `cardEntries`  — the registered `card:*` kinds the engine dispatches to.
//   - `CardRenderer` — the tier's host/façade that consumers (panes, canvas)
//                      call to instantiate a card.
//
// The host resolves the renderer name via the config-driven
// `resolveCardRenderer`, builds a node `{ kind: 'card:<renderer>', spec }` and
// delegates to NodeRenderer. Each card component reads boardId/cardId from
// `spec`, so the engine renders it directly — no adapter.
//
// `meta.bare` opts the entries out of the engine's column framing (label + w-100
// wrappers): a card owns its own outer shell (ResizableCardShell / board-card).

import React, { memo } from 'react';
import { useCardState } from '../../../hooks/useCardState.js';
import { resolveCardRenderer } from '../../../lib/cardPresentationConfig.js';
import { NodeRenderer } from '../engine/NodeRenderer.jsx';
import { CardShell } from './CardShell.jsx';
import { StrategistCard } from './StrategistCard.jsx';
import { IngestCard } from './IngestCard.jsx';
import { PostboxCard } from './PostboxCard.jsx';

export const cardEntries = [
  { kind: 'card:default', renderComponentFn: CardShell, meta: { bare: true } },
  { kind: 'card:strategist', renderComponentFn: StrategistCard, meta: { bare: true } },
  { kind: 'card:ingest', renderComponentFn: IngestCard, meta: { bare: true } },
  { kind: 'card:postbox', renderComponentFn: PostboxCard, meta: { bare: true } },
  {
    kind: 'card:postbox-universal',
    renderComponentFn: PostboxCard,
    defaultVariant: 'universal',
    meta: { bare: true },
  },
];

function CardRendererComponent({ boardId, cardId, rendererRules = [], enableResize = false, chrome = 'full' }) {
  const cardState = useCardState(boardId, cardId);

  if (!cardState?.cardContent) return null;

  // Host-level kind resolution (config-driven), mirroring how CardCore resolves
  // element kinds before handing off. The engine then dispatches the card entry.
  // `chrome` is presentation context supplied by the pane (full | inspect |
  // bare) — it rides in spec like enableResize, never via the registry/variant.
  const renderer = resolveCardRenderer(cardState, rendererRules);
  const node = {
    kind: `card:${renderer}`,
    spec: { boardId, cardId, enableResize, chrome },
  };

  return <NodeRenderer node={node} />;
}

export const CardRenderer = memo(CardRendererComponent);
