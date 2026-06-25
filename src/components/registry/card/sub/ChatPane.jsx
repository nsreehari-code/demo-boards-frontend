import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import BoardMarkdown from '../../../shared/BoardMarkdown.jsx';
import { MessageWithAttachmentsInput } from '../../../shared/MessageWithAttachmentsInput.jsx';
import { ChatBubble } from '../../../shared/chat/ChatBubble.jsx';
import { AgentWorkingBubble } from '../../../shared/chat/AgentWorkingBubble.jsx';
import { useChatState } from '../../../../hooks/useChatState.js';
import { useCardStateFilesData } from '../../../../hooks/useCardState.js';
import { callBoardMcp, ensureCardFileUrl, getCardFileUrl } from '../../../../lib/client.js';

// Number of user turns to fetch each time "Show previous messages" is clicked.
const HISTORY_TURNS_PER_PAGE = 5;

async function fetchChatHistoryBeforeTurn(boardId, cardId, beforeTurnId, turns) {
  const response = await callBoardMcp(boardId, 'inspect.chat-messages-on-cards', {
    card_id: cardId,
    tail_turns: turns,
    ...(beforeTurnId ? { tail_turns_before_id: beforeTurnId } : null),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof payload?.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : `inspect.chat-messages-on-cards failed with status ${response.status}`;
    throw new Error(message);
  }
  const data = payload && typeof payload === 'object' && payload.status === 'success' && 'data' in payload
    ? payload.data
    : payload;
  return Array.isArray(data?.messages) ? data.messages : [];
}

// Merge a fresh SSE messages snapshot into the previously-accumulated live
// messages. The board's SSE chat view typically carries only the most recent
// turn, so we accumulate across snapshots instead of replacing: new messages
// are appended, and an existing message (same turn/role/occurrence) is updated
// in place to support streaming text. Returns the previous array unchanged when
// nothing changed to avoid needless re-renders.
function mergeLiveMessages(prev, incoming) {
  if (!Array.isArray(incoming) || incoming.length === 0) return prev;

  const byKey = new Map();
  const order = [];
  for (const entry of prev) {
    byKey.set(entry.key, entry.msg);
    order.push(entry.key);
  }

  const counts = new Map();
  let changed = false;
  for (const msg of incoming) {
    const turn = typeof msg?.turn === 'string' ? msg.turn : '';
    const base = `${turn}|${msg?.role ?? ''}`;
    const occurrence = counts.get(base) ?? 0;
    counts.set(base, occurrence + 1);
    const key = `${base}|${occurrence}`;
    if (!byKey.has(key)) {
      order.push(key);
      changed = true;
    } else if (byKey.get(key) !== msg) {
      changed = true;
    }
    byKey.set(key, msg);
  }

  if (!changed) return prev;
  return order.map((key) => ({ key, msg: byKey.get(key) }));
}

function mergeMessageArrays(existingMessages, incomingMessages) {
  const seeded = mergeLiveMessages([], existingMessages).map((entry) => ({ key: entry.key, msg: entry.msg }));
  return mergeLiveMessages(seeded, incomingMessages).map((entry) => entry.msg);
}

function getMessageTurnId(msg) {
  return typeof msg?.turn === 'string' ? msg.turn.trim() : '';
}

function getFirstTurnId(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map((msg) => getMessageTurnId(msg))
    .find(Boolean) || '';
}

function countDistinctTurns(messages) {
  return new Set(
    (Array.isArray(messages) ? messages : [])
      .map((msg) => getMessageTurnId(msg))
      .filter(Boolean),
  ).size;
}

// Subscribe to chat SSE on mount so the server sends card_chats notifications
function useChatSubscription(subscribeChat, unsubscribeChat, boardId, cardId, boardSseClientId) {
  useEffect(() => {
    if (!subscribeChat || !unsubscribeChat || !boardId || !cardId || !boardSseClientId) return;
    subscribeChat().catch(() => {});
    return () => {
      unsubscribeChat().catch(() => {});
    };
  }, [subscribeChat, unsubscribeChat, boardId, cardId, boardSseClientId]);
}

function ChatPopoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 5h5v5" />
      <path d="M10 14 19 5" />
      <path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
    </svg>
  );
}

function ChatAttachIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.2a2 2 0 0 1-2.82-2.83l8.48-8.48" />
    </svg>
  );
}

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

const MessageList = React.memo(function MessageList({ messages, compact, boardId, cardId, openMsgId, onToggleExpand, idPrefix = 'm' }) {
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

function ChatTurnHistoryButton({ loading, disabled, onClick }) {
  return (
    <div className="board-chat-pane__history-row text-center my-1">
      <button
        type="button"
        className="btn btn-link btn-sm p-0 text-decoration-none"
        onClick={onClick}
        disabled={disabled || loading}
      >
        {loading ? 'Loading previous messages…' : 'Show previous messages'}
      </button>
    </div>
  );
}

// Self-contained history surface. It owns its own backward-paged source built
// strictly from messages BEFORE `beforeTurnId` (the chat pane's mount-time
// anchor turn, which never changes for the life of the pane). Because the live
// ChatPane only renders the anchor turn and everything after it, history and
// live can never collide on the same turn.
function ChatHistoryPane({ boardId, cardId, beforeTurnId, compact, openMsgId, onToggleExpand }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursorTurnId, setCursorTurnId] = useState(beforeTurnId);
  const didInitialFetchRef = useRef(false);

  const loadBefore = useCallback(async (turnId) => {
    if (!boardId || !cardId || !turnId) return;
    setLoading(true);
    try {
      const older = await fetchChatHistoryBeforeTurn(boardId, cardId, turnId, HISTORY_TURNS_PER_PAGE);
      if (older.length === 0) {
        setHasMore(false);
        return;
      }
      setHistory((prev) => mergeMessageArrays(older, prev));
      const nextCursorTurnId = getFirstTurnId(older);
      if (!nextCursorTurnId || nextCursorTurnId === turnId) {
        setHasMore(false);
        return;
      }
      setCursorTurnId(nextCursorTurnId);
      setHasMore(countDistinctTurns(older) >= HISTORY_TURNS_PER_PAGE);
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [boardId, cardId]);

  // Exactly one automatic fetch on mount, anchored at the immutable turn id.
  useEffect(() => {
    if (didInitialFetchRef.current || !beforeTurnId) return;
    didInitialFetchRef.current = true;
    void loadBefore(beforeTurnId);
  }, [beforeTurnId, loadBefore]);

  const handleLoadPrevious = useCallback(() => {
    if (loading) return;
    void loadBefore(cursorTurnId);
  }, [loading, cursorTurnId, loadBefore]);

  const historyEntries = useMemo(
    () => history.map((msg) => ({ msg, isHistory: true })),
    [history],
  );

  if (history.length === 0 && !hasMore) {
    return null;
  }

  return (
    <>
      {hasMore ? (
        <ChatTurnHistoryButton
          loading={loading}
          disabled={!cursorTurnId || loading}
          onClick={handleLoadPrevious}
        />
      ) : null}
      <MessageList
        messages={historyEntries}
        compact={compact}
        boardId={boardId}
        cardId={cardId}
        openMsgId={openMsgId}
        onToggleExpand={onToggleExpand}
        idPrefix="history"
      />
    </>
  );
}

const ChatComposer = React.memo(function ChatComposer({
  chatActions,
  placeholder,
  processing,
  turnId,
  cardId,
  variant = 'default',
  onPopout,
}) {
  const isMini = variant === 'mini';

  const upload = (file) => {
    if (!file || processing) return;
    chatActions.uploadFileForChat(file, turnId).catch(() => {});
  };

  const submitText = ({ text }) => {
    const t = (text || '').trim();
    if (!t) return;
    chatActions.sendChatAction(t, { turnId }).catch(() => {});
  };

  return (
    <MessageWithAttachmentsInput
      staged={false}
      multiline
      requireText
      disabled={processing}
      onAttach={(files) => upload(files[0])}
      onSubmit={submitText}
      placeholder={placeholder ?? 'Send a message…'}
      className={`board-chat-pane__composer border-top d-flex flex-column gap-2 flex-shrink-0${isMini ? ' board-chat-pane__composer--mini p-1' : ' p-2'}`}
      inputRowClassName={`board-chat-pane__input-row d-flex gap-2 align-items-end${isMini ? ' board-chat-pane__input-row--mini' : ''}`}
      attachVariant={isMini ? 'button' : 'dropzone'}
      dropzoneClassName="board-chat-pane__dropzone border rounded-3 p-2 small text-center"
      dropzoneActiveClassName="is-active"
      dropzoneDisabledClassName="is-disabled"
      dropzoneContent="Drop a file here or click to browse"
      attachButtonClassName="board-chat-pane__icon-button board-icon-button board-icon-button--sm flex-shrink-0"
      attachButtonContent={<ChatAttachIcon />}
      attachButtonProps={{
        title: 'Attach file',
        'aria-label': `Attach file for ${cardId}`,
        'data-testid': `chat-pane-attach-${cardId}`,
      }}
      inputClassName="board-chat-pane__textarea form-control form-control-sm"
      inputProps={{
        rows: 1,
        style: { resize: 'none', minHeight: '38px', maxHeight: '160px' },
        'data-testid': `chat-pane-textarea-${cardId}`,
      }}
      submitClassName="board-chat-pane__send btn btn-sm btn-primary flex-shrink-0"
      submitContent={<i className="bi bi-send" />}
      submitProps={{
        'data-testid': `chat-pane-send-${cardId}`,
        'aria-label': `Send chat for ${cardId}`,
      }}
    />
  );
});

function makeTurnId() {
  return Math.random().toString(36).slice(2, 8).padEnd(6, '0');
}

function isPendingFileUploadMessage(msg) {
  if (!msg || msg.role !== 'system') return false;
  const text = typeof msg.text === 'string' ? msg.text.trim() : '';
  return /^file uploaded:/i.test(text);
}

function ChatPaneBase({
  boardId,
  cardId,
  readOnly = false,
  compact = false,
  composerVariant = 'default',
  onPopout,
  className = '',
  headerContent = null,
  historyEnabled = false,
}) {
  const chat = useChatState(boardId, cardId);
  const messages = chat?.messages ?? [];
  const processing = chat?.processing ?? false;
  const chatActions = chat?.chatActions ?? null;
  const boardSseClientId = chat?.boardSseClientId ?? null;
  const messagesRef = useRef(null);
  const bottomRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const scrollFrameRef = useRef(null);
  const [draftTurnId, setDraftTurnId] = useState(() => makeTurnId());
  const [openMsgId, setOpenMsgId] = useState(null);
  const [liveMessages, setLiveMessages] = useState([]);
  const [historyAnchorTurnId, setHistoryAnchorTurnId] = useState('');
  const liveKeyRef = useRef('');
  const handleToggleExpand = useCallback((msgId) => {
    setOpenMsgId((prev) => (prev === msgId ? null : msgId));
  }, []);

  // Accumulate live SSE messages so new turns append rather than replace the
  // already-rendered conversation (the SSE chat view may only carry the latest
  // turn). Reset accumulation when the board/card changes.
  useEffect(() => {
    if (!historyEnabled) return;
    const key = `${boardId}::${cardId}`;
    setLiveMessages((prev) => {
      if (liveKeyRef.current !== key) {
        liveKeyRef.current = key;
        return mergeLiveMessages([], messages);
      }
      return mergeLiveMessages(prev, messages);
    });
  }, [historyEnabled, boardId, cardId, messages]);

  const liveForDisplay = useMemo(
    () => (historyEnabled ? liveMessages.map((entry) => entry.msg) : messages),
    [historyEnabled, liveMessages, messages],
  );

  const displayMessages = useMemo(
    () => liveForDisplay.map((msg) => ({ msg, isHistory: false })),
    [liveForDisplay],
  );

  const firstLiveTurnId = useMemo(
    () => getFirstTurnId(liveForDisplay),
    [liveForDisplay],
  );

  // Lock the history/live boundary once: the first turn id the live stream
  // shows becomes the immutable anchor. History is everything strictly before
  // it; the live forward stream owns this turn and everything after.
  useEffect(() => {
    if (!historyEnabled || historyAnchorTurnId || !firstLiveTurnId) {
      return;
    }
    setHistoryAnchorTurnId(firstLiveTurnId);
  }, [historyEnabled, historyAnchorTurnId, firstLiveTurnId]);

  const scrollToBottom = (behavior = 'auto') => {
    const element = messagesRef.current;
    if (!element) {
      bottomRef.current?.scrollIntoView({ behavior });
      return;
    }

    element.scrollTo({
      top: element.scrollHeight,
      behavior,
    });
  };

  const scheduleScrollToBottom = useCallback((behavior = 'auto') => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      scrollToBottom(behavior);
    });
  }, []);

  useEffect(() => {
    const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    if (isPendingFileUploadMessage(lastMsg) && typeof lastMsg.turn === 'string' && lastMsg.turn.trim()) {
      if (draftTurnId !== lastMsg.turn) {
        setDraftTurnId(lastMsg.turn);
      }
      return;
    }
    if (lastMsg && typeof lastMsg.turn === 'string' && lastMsg.turn.trim() === draftTurnId) {
      setDraftTurnId(makeTurnId());
    }
  }, [messages, draftTurnId]);

  useChatSubscription(
    chatActions?.subscribeChat,
    chatActions?.unsubscribeChat,
    boardId,
    cardId,
    boardSseClientId,
  );

  useEffect(() => {
    const element = messagesRef.current;
    if (!element) {
      return undefined;
    }

    const updateStickyState = () => {
      const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
      shouldStickToBottomRef.current = distanceFromBottom <= 72;
    };

    updateStickyState();
    element.addEventListener('scroll', updateStickyState, { passive: true });
    return () => element.removeEventListener('scroll', updateStickyState);
  }, []);

  useEffect(() => {
    if (initialScrollDoneRef.current) {
      return;
    }

    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      scrollToBottom('auto');
      shouldStickToBottomRef.current = true;
      initialScrollDoneRef.current = true;
    });

    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [messages.length, processing, boardId, cardId]);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }

    scheduleScrollToBottom(messages.length > 0 || processing ? 'smooth' : 'auto');

    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [messages.length, processing]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  const handleWorkingBubbleLayoutChange = useCallback(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }

    scheduleScrollToBottom('auto');
  }, [scheduleScrollToBottom]);

  if (!chat) return null;

  return (
    <div className={`board-chat-pane ${className}`.trim()}>
      {headerContent}
      <div
        ref={messagesRef}
        className="board-chat-pane__messages p-2"
      >
        {historyEnabled && historyAnchorTurnId ? (
          <ChatHistoryPane
            boardId={boardId}
            cardId={cardId}
            beforeTurnId={historyAnchorTurnId}
            compact={compact}
            openMsgId={openMsgId}
            onToggleExpand={handleToggleExpand}
          />
        ) : null}
        <MessageList
          messages={displayMessages}
          compact={compact}
          boardId={boardId}
          cardId={cardId}
          openMsgId={openMsgId}
          onToggleExpand={handleToggleExpand}
          idPrefix="live"
        />
        {processing && (
          <AgentWorkingBubble
            cardId={cardId}
            agentOutput={chat?.agentOutput}
            agentTools={chat?.agentTools}
            compact={compact}
            onLayoutChange={handleWorkingBubbleLayoutChange}
          />
        )}
        <div ref={bottomRef} />
      </div>
      {!readOnly && chatActions && !(composerVariant === 'mini' && processing) ? (
        <ChatComposer
          chatActions={chatActions}
          processing={processing}
          turnId={draftTurnId}
          cardId={cardId}
          variant={composerVariant}
          onPopout={onPopout}
        />
      ) : null}
    </div>
  );
}

export function ChatPane({ boardId, cardId, readOnly = false, compact = false }) {
  return <ChatPaneBase boardId={boardId} cardId={cardId} readOnly={readOnly} compact={compact} historyEnabled={true} />;
}

export function GandalfChatPane({ boardId, cardId, readOnly = false, compact = false }) {
  return <ChatPaneBase boardId={boardId} cardId={cardId} readOnly={readOnly} compact={compact} historyEnabled={true} />;
}

export function MiniChatPane({ boardId, cardId, readOnly = false, compact = false, onPopout }) {
  const headerContent = onPopout ? (
    <div className="board-chat-pane__mini-header px-2 py-1">
      <div className="board-chat-pane__mini-title">Chat</div>
      <button
        type="button"
        className="board-chat-pane__icon-button board-icon-button board-icon-button--sm"
        onClick={onPopout}
        title="Open full chat"
        aria-label={`Open full chat for ${cardId}`}
      >
        <ChatPopoutIcon />
      </button>
    </div>
  ) : null;

  return (
    <ChatPaneBase
      boardId={boardId}
      cardId={cardId}
      readOnly={readOnly}
      compact={compact}
      composerVariant="mini"
      onPopout={onPopout}
      className="board-chat-pane--mini"
      headerContent={headerContent}
    />
  );
}
