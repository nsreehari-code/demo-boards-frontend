// Tier-3 pane entries. Panes are hosts that own their own outer shell
// (container / aside / rail DOM) and enumerate cards internally, so they are
// `meta.bare` (the engine adds no framing). Each pane reads its inputs from
// `spec` and is rendered directly by the engine — no adapter.
//
//   pane:centre   — the main board surface (flowing-cards | infinite-canvas)
//   pane:gandalf  — left ingest rail (carousel of ingest cards)
//   pane:truthset — right truthset-explore rail (carousel of truthset cards)

import { CentrePane } from './CentrePane.jsx';
import { GandalfPane } from './GandalfPane.jsx';
import { TruthsetExplorePane } from './TruthsetExplorePane.jsx';

export const paneEntries = [
  { kind: 'pane:centre', renderComponentFn: CentrePane, meta: { bare: true } },
  { kind: 'pane:gandalf', renderComponentFn: GandalfPane, meta: { bare: true } },
  { kind: 'pane:truthset', renderComponentFn: TruthsetExplorePane, meta: { bare: true } },
];
