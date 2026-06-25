import React, { useEffect, useRef, useState } from 'react';
import BoardMarkdown from '../BoardMarkdown.jsx';
import { ChatBubble } from './ChatBubble.jsx';
import { useCardStateFilesData } from '../../../hooks/useCardState.js';
import { ensureCardFileUrl, getCardFileUrl } from '../../../lib/client.js';
import { getMessageTurnId } from '../../../lib/chatMessages.js';

function ChatMessageText({ text, expanded, onOverflowChange }) {
  const messageRef = useRef(null);
  const normalizedText = typeof text === 'string' ? text.trim() : '';

  useEffect(() => {
    if (!normalizedText) {
      onOverflowChange?.(false);
      return;
    }

    const element = messageRef.current;
    if (!element) {
      onOverflowChange?.(false);
      return;
    }

    const checkOverflow = () => {
      const hasOverflow = element.scrollHeight > element.clientHeight + 1;
      onOverflowChange?.(hasOverflow);
    };

    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [normalizedText, onOverflowChange, expanded]);

  if (!normalizedText) {
    return null;
  }

  return (
    <div
      ref={messageRef}
      className="board-chat__message"
      style={{
        color: 'inherit',
        maxHeight: expanded ? 'none' : '7em',
        overflow: expanded ? 'visible' : 'hidden',
      }}
    >
      <BoardMarkdown text={normalizedText} />
    </div>
  );
}

function resolveChatAttachmentDownloadUrl(boardId, cardId, file, index) {
  if (!boardId || !cardId || !file || !Number.isInteger(index) || index < 0) {
    return null;
  }

  const storedName = typeof file.stored_name === 'string' ? file.stored_name : '';
  if (!storedName) {
    return null;
  }

  return getCardFileUrl(boardId, cardId, index, storedName);
}

function parseIndexedSystemAttachment(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return null;
  }

  const match = /^(file uploaded|AI generated):\s*(.*?)\s*#(\d+)\s*$/i.exec(text.trim());
  if (!match) {
    return null;
  }

  const index = Number.parseInt(match[3], 10);
  if (!Number.isInteger(index) || index < 0) {
    return null;
  }

  return {
    kind: String(match[1] || '').toLowerCase(),
    label: String(match[2] || '').trim(),
    index,
  };
}

function SystemAttachmentChip({ boardId, cardId, file, index, label }) {
  const [resolvedHref, setResolvedHref] = useState(() => resolveChatAttachmentDownloadUrl(boardId, cardId, file, index));
  const displayLabel = label || file?.name || file?.stored_name || `Attachment #${index}`;

  useEffect(() => {
    const nextHref = resolveChatAttachmentDownloadUrl(boardId, cardId, file, index);
    if (nextHref) {
      setResolvedHref(nextHref);
      return undefined;
    }

    let cancelled = false;
    const storedName = typeof file?.stored_name === 'string' ? file.stored_name : '';
    if (!storedName) {
      setResolvedHref('');
      return undefined;
    }

    void ensureCardFileUrl(boardId, cardId, index, storedName)
      .then((href) => {
        if (!cancelled) setResolvedHref(href || '');
      })
      .catch(() => {
        if (!cancelled) setResolvedHref('');
      });

    return () => {
      cancelled = true;
    };
  }, [boardId, cardId, file, index]);

  if (!resolvedHref) {
    return null;
  }

  return (
    <a
      href={resolvedHref}
      className="badge rounded-pill text-bg-light border text-decoration-none text-body-emphasis"
      target="_blank"
      rel="noreferrer"
      title={displayLabel}
    >
      <i className="bi bi-paperclip me-1" />
      {displayLabel}
    </a>
  );
}

function SystemMessage({ msg, boardId, cardId }) {
  const filesUploaded = useCardStateFilesData(boardId, cardId);
  const text = typeof msg?.text === 'string' ? msg.text : '';
  const indexedAttachment = parseIndexedSystemAttachment(text);
  const indexedFile = indexedAttachment ? filesUploaded[indexedAttachment.index] : null;
  const directLabel = indexedAttachment?.label || indexedFile?.name || indexedFile?.stored_name || text;
  const showText = !(indexedFile && indexedAttachment);

  return (
    <ChatBubble
      variant="system"
      attachments={indexedFile && indexedAttachment ? (
        <SystemAttachmentChip
          boardId={boardId}
          cardId={cardId}
          file={indexedFile}
          index={indexedAttachment.index}
          label={directLabel}
        />
      ) : null}
    >
      {showText ? <div>{text}</div> : null}
    </ChatBubble>
  );
}

function ChatBubbleImpl({ msg, msgId, expanded, onToggleExpand, compact = false, boardId, cardId, isHistory = false }) {
  const { role, text, files } = msg;
  const [isOverflowing, setIsOverflowing] = useState(false);
  if (role === 'system') {
    return <SystemMessage msg={msg} boardId={boardId} cardId={cardId} />;
  }
  const isUser = role === 'user';
  const showFooter = isOverflowing || expanded;
  return (
    <ChatBubble
      variant={isUser ? 'user' : 'assistant'}
      attachments={(files ?? []).map((f, i) => (
        <div key={i} className="badge bg-secondary-subtle text-secondary-emphasis mt-1 d-block">{f}</div>
      ))}
      footer={showFooter ? (
        <button
          type="button"
          className="d-flex justify-content-center align-items-center btn btn-link p-0 border-0"
          onClick={() => onToggleExpand?.(msgId)}
          title={expanded ? 'Collapse message' : 'Expand message'}
          aria-label={expanded ? 'Collapse message' : 'Expand message'}
          aria-expanded={expanded}
          style={{
            marginLeft: '-0.5rem',
            marginRight: '-0.5rem',
            marginBottom: '-0.5rem',
            marginTop: '0.4rem',
            paddingTop: '0.2rem',
            paddingBottom: '0.2rem',
            borderTop: '1px solid var(--color-border)',
            background: 'color-mix(in srgb, var(--color-surface-muted) 88%, transparent)',
            borderBottomLeftRadius: 'inherit',
            borderBottomRightRadius: 'inherit',
            color: 'var(--color-text-soft)',
            textDecoration: 'none',
          }}
        >
          <svg
            width="18"
            height="10"
            viewBox="0 0 24 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 120ms ease',
            }}
          >
            <polyline points="3 3 12 10 21 3" />
          </svg>
        </button>
      ) : null}
    >
      <ChatMessageText text={text} expanded={expanded} onOverflowChange={setIsOverflowing} />
    </ChatBubble>
  );
}

const ChatMessageBubble = React.memo(ChatBubbleImpl, (prev, next) => (
  prev.msg === next.msg
  && prev.msgId === next.msgId
  && prev.expanded === next.expanded
  && prev.onToggleExpand === next.onToggleExpand
  && prev.compact === next.compact
  && prev.boardId === next.boardId
  && prev.cardId === next.cardId
  && prev.isHistory === next.isHistory
));

export const MessageList = React.memo(function MessageList({ messages, compact, boardId, cardId, openMsgId, onToggleExpand, idPrefix = 'm' }) {
  const occurrences = new Map();
  return (
    <>
      {messages.map((entry) => {
        const msg = entry?.msg ?? entry;
        const isHistory = entry?.isHistory === true;
        const turn = getMessageTurnId(msg) || 'noturn';
        const base = `${idPrefix}:${turn}:${msg?.role ?? ''}`;
        const occurrence = occurrences.get(base) ?? 0;
        occurrences.set(base, occurrence + 1);
        const msgId = `${base}:${occurrence}`;
        return (
          <ChatMessageBubble
            key={msgId}
            msg={msg}
            msgId={msgId}
            expanded={openMsgId === msgId}
            onToggleExpand={onToggleExpand}
            compact={compact}
            boardId={boardId}
            cardId={cardId}
            isHistory={isHistory}
          />
        );
      })}
    </>
  );
});

export default MessageList;
