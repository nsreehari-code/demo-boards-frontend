import React from 'react';

/**
 * Shared chat message bubble.
 *
 * Renders the visual container for a single chat message and selects its
 * appearance from the `variant`:
 *  - `user`      — right-aligned bubble, person avatar, muted surface.
 *  - `assistant` — left-aligned bubble, sparkle avatar, accent surface.
 *  - `system`    — centered, muted, italic notice (no bubble chrome / avatar).
 *
 * Content is provided through children (the message body) plus optional slots:
 *  - `attachments` — rendered after the body (e.g. file chips).
 *  - `footer`      — rendered at the bottom of the bubble (e.g. expand toggle).
 *  - `icon`        — overrides the default avatar for the variant.
 */

export function UserBubbleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

export function AssistantBubbleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

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

const VARIANT_ICON = {
  user: <UserBubbleIcon />,
  assistant: <AssistantBubbleIcon />,
};

export function ChatBubble({
  variant = 'assistant',
  icon,
  showIcon,
  attachments = null,
  footer = null,
  className = '',
  style,
  children,
  ...rest
}) {
  if (variant === 'system') {
    return (
      <div
        className={`board-chat-bubble board-chat-bubble--system text-center small text-muted fst-italic px-2 my-1 d-flex flex-column align-items-center${className ? ` ${className}` : ''}`}
        style={{ gap: '0.35rem', ...style }}
        {...rest}
      >
        {children}
        {attachments}
      </div>
    );
  }

  const isUser = variant === 'user';
  const renderIcon = showIcon ?? true;
  const resolvedIcon = icon !== undefined ? icon : VARIANT_ICON[variant];

  return (
    <div
      className={`d-flex mb-2${isUser ? ' justify-content-end' : ''}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      <div
        className={`board-chat-bubble board-chat-bubble--${variant} px-2 py-2 rounded-3 small d-flex flex-column`}
        style={{
          maxWidth: '82%',
          background: isUser
            ? 'color-mix(in srgb, var(--color-surface-muted) 92%, transparent)'
            : 'color-mix(in srgb, var(--color-accent-soft) 84%, var(--color-surface-strong))',
          border: isUser ? '1px solid var(--color-border)' : '1px solid var(--color-border-strong)',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          overflowX: 'hidden',
          ...style,
        }}
      >
        <div className={`d-flex align-items-start${isUser ? ' flex-row-reverse' : ''}`} style={{ gap: '0.45rem' }}>
          {renderIcon ? <ChatIconShell>{resolvedIcon}</ChatIconShell> : null}
          <div className="flex-grow-1 min-w-0">
            {children}
            {attachments}
          </div>
        </div>
        {footer}
      </div>
    </div>
  );
}

export default ChatBubble;
