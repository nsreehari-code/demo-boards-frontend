import React from 'react';

/**
 * Small presentational wrapper for a chat avatar/icon.
 *
 * Provides the shared alignment and muted styling used by chat bubbles and the
 * agent working bubble. Purely prop/children-driven.
 */
export function ChatIconShell({ children }) {
  return (
    <span
      className="flex-shrink-0 d-inline-flex align-items-center"
      aria-hidden="true"
      style={{ lineHeight: 1.4, opacity: 0.55, marginTop: '0.1rem' }}
    >
      {children}
    </span>
  );
}

export default ChatIconShell;
