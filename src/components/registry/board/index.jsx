// Tier-4 board entries. A board is the litmus case for the engine's structural
// recursion: it is "just an entry that supplies a childResolver". The resolver
// enumerates the board's panes (node objects on `spec.panes`); the engine
// renders each through NodeRenderer and hands the results to BoardShell as
// children. `meta.bare` because the board owns no chrome. This makes a board
// authorable as plain JSON and renderable in any slot.
//
// The board's resolution host (data → pane nodes) lives in
// src/components/renderers/BoardRenderer.jsx — outside the registry, so this
// barrel never imports NodeRenderer and the registry-init cycle can't form.

import { BoardShell } from './BoardShell.jsx';

export const boardEntries = [
  {
    kind: 'board:default',
    renderComponentFn: BoardShell,
    childResolver: (spec) => spec?.panes ?? [],
    meta: { bare: true },
  },
];
