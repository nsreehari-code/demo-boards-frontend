import React from 'react';

// Board tier shell. A board owns no chrome of its own — it is purely a
// container whose children (panes) are enumerated by the board entry's
// `childResolver` and rendered by the engine. Kept as a component (rather than
// a bare fragment baked into the entry) so future board kinds can add
// board-level framing without touching the engine.
export function BoardShell({ children }) {
  return <>{children}</>;
}
