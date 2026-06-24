// Tier-3 pane entries. Panes own their own outer shell (container / aside / rail
// DOM) and enumerate cards internally, so they are `meta.bare` (the engine adds
// no framing). Each concrete pane reads its inputs from `spec`.
//
//   pane:centre   — the main board surface (flowing-cards | infinite-canvas)
//   pane:gandalf  — left ingest rail (carousel of ingest cards)
//   pane:truthset — right truthset-explore rail (carousel of truthset cards)
//
// The generic `pane` kind dispatches to PaneRenderer (the tier's resolution
// host, in src/components/renderers/), which decides presence — hiding empty
// rails — before delegating to the concrete `pane:<kind>`. PaneRenderer is
// referenced here only as a value and imports NodeRenderer at call time, so this
// barrel stays safe for registry init.

import { PaneRenderer } from '../../renderers/PaneRenderer.jsx';
import { CentrePane } from './CentrePane.jsx';
import { GandalfPane } from './GandalfPane.jsx';
import { TruthsetExplorePane } from './TruthsetExplorePane.jsx';

export const paneEntries = [
  { kind: 'pane', renderComponentFn: PaneRenderer, meta: { bare: true } },
  { kind: 'pane:centre', renderComponentFn: CentrePane, meta: { bare: true } },
  { kind: 'pane:gandalf', renderComponentFn: GandalfPane, meta: { bare: true } },
  { kind: 'pane:truthset', renderComponentFn: TruthsetExplorePane, meta: { bare: true } },
];
