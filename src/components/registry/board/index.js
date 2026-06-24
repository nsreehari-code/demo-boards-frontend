// Tier-4 board entry. A board is the litmus case for the engine's structural
// recursion: it is "just an entry that supplies a childResolver". The resolver
// enumerates the board's panes (node objects on `spec.panes`); the engine
// renders each through NodeRenderer and hands the results to BoardShell as
// children. `meta.bare` because the board owns no chrome.
//
// This makes a board authorable as plain JSON and renderable in any slot
// (e.g. nested inside a card body) with no board-specific code.

import { BoardShell } from './BoardShell.jsx';

export const boardEntries = [
  {
    kind: 'board:default',
    renderComponentFn: BoardShell,
    childResolver: (spec) => spec?.panes ?? [],
    meta: { bare: true },
  },
];
