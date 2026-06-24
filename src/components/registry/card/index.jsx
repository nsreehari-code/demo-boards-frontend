// Tier-2 card entries — the registered `card:*` kinds the engine dispatches to.
// Each card component reads boardId/cardId from `spec`, so the engine renders it
// directly — no adapter. `meta.bare` opts the entries out of the engine's column
// framing: a card owns its own outer shell (ResizableCardShell / board-card).
//
// The card resolution host (data → card kind) lives in
// src/components/renderers/CardRenderer.jsx — outside the registry, so this
// barrel never imports NodeRenderer and the registry-init cycle can't form.

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
