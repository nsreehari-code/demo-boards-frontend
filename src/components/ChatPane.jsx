import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChatState } from '../hooks/useChatState.js';
import { SERVER } from '../lib/client.js';

// Subscribe to chat SSE on mount so the server sends card_chats notifications
function useChatSubscription(
  subscribeChat,
  unsubscribeChat,
  subscribeCopilotOutput,
  unsubscribeCopilotOutput,
  subscribeCopilotTools,
  unsubscribeCopilotTools,
  boardId,
  cardId,
  boardSseClientId,
) {
  useEffect(() => {
    if (!subscribeChat || !unsubscribeChat || !boardId || !cardId || !boardSseClientId) return;
    subscribeChat().catch(() => {});
    subscribeCopilotOutput?.().catch(() => {});
    subscribeCopilotTools?.().catch(() => {});
    return () => {
      unsubscribeCopilotTools?.().catch(() => {});
      unsubscribeCopilotOutput?.().catch(() => {});
      unsubscribeChat().catch(() => {});
    };
  }, [
    subscribeChat,
    unsubscribeChat,
    subscribeCopilotOutput,
    unsubscribeCopilotOutput,
    subscribeCopilotTools,
    unsubscribeCopilotTools,
    boardId,
    cardId,
    boardSseClientId,
  ]);
}

function UserBubbleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function AssistantBubbleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function WorkingBubbleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function ChatIconShell({ children }) {
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

function ChatMessageText({ text, onOverflowChange }) {
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
  }, [normalizedText, onOverflowChange]);

  if (!normalizedText) {
    return null;
  }

  return (
    <div
      ref={messageRef}
      className="small mb-0 markdown-body lh-sm board-markdown board-chat__message"
      style={{
        color: 'inherit',
        maxHeight: '7em',
        overflow: 'hidden',
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ node, ...props }) => <p className="mb-1" {...props} />,
          ul: ({ node, ...props }) => <ul className="mb-1 ps-3" {...props} />,
          ol: ({ node, ...props }) => <ol className="mb-1 ps-3" {...props} />,
          li: ({ node, ...props }) => <li className="mb-1" {...props} />,
          a: ({ node, ...props }) => <a className="link-primary text-decoration-none" target="_blank" rel="noreferrer" {...props} />,
          blockquote: ({ node, ...props }) => <blockquote className="border-start border-3 ps-2 fst-italic my-2" style={{ borderColor: 'var(--color-border-strong)' }} {...props} />,
          hr: ({ node, ...props }) => <hr className="my-2 opacity-25" {...props} />,
          strong: ({ node, ...props }) => <strong className="fw-semibold" {...props} />,
          code: ({ inline, className, children, ...props }) => (
            inline ? (
              <code className="board-code rounded px-1 py-0" style={{ background: 'rgba(255, 255, 255, 0.06)' }} {...props}>{children}</code>
            ) : (
              <code className={`${className ?? ''} board-code small`.trim()} {...props}>{children}</code>
            )
          ),
          pre: ({ node, ...props }) => <pre className="board-code-block p-2 mb-2 overflow-auto" style={{ lineHeight: 1.4 }} {...props} />,
          table: ({ node, ...props }) => (
            <div className="table-responsive my-2">
              <table className="table table-sm table-striped align-middle mb-0 board-data-table" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => <thead {...props} />,
          img: ({ node, ...props }) => <img className="img-fluid rounded my-2" style={{ border: '1px solid var(--color-border)' }} loading="lazy" {...props} />,
        }}
      >
        {normalizedText}
      </ReactMarkdown>
    </div>
  );
}

function MessageModal({ title, text, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="board-modal position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{ zIndex: 1250, padding: '1rem' }}
      onClick={onClose}
    >
      <div
        className="board-modal__dialog w-100"
        style={{
          width: 'calc(100vw - 2rem)',
          height: 'calc(100vh - 2rem)',
          maxWidth: 'none',
          maxHeight: 'none',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="board-modal__header d-flex align-items-center justify-content-between gap-2 px-3 py-3">
          <div className="board-modal__title text-truncate">{title}</div>
          <button type="button" className="board-icon-button" onClick={onClose} title="Close message">
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <div className="board-modal__body p-3 overflow-auto" style={{ height: 'calc(100% - 65px)' }}>
          <div className="small mb-0 markdown-body lh-sm board-markdown" style={{ color: 'var(--color-text)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {typeof text === 'string' ? text : ''}
            </ReactMarkdown>
          </div>
        </div>
      </div>
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

  return `${SERVER}/api/boards/${boardId}/cards/${cardId}/files/${index}?sn=${encodeURIComponent(storedName)}`;
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
  const href = resolveChatAttachmentDownloadUrl(boardId, cardId, file, index);
  const displayLabel = label || file?.name || file?.stored_name || `Attachment #${index}`;

  if (!href) {
    return null;
  }

  return (
    <a
      href={href}
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

function SystemMessage({ msg, boardId, cardId, filesUploaded = [] }) {
  const text = typeof msg?.text === 'string' ? msg.text : '';
  const indexedAttachment = parseIndexedSystemAttachment(text);
  const indexedFile = indexedAttachment ? filesUploaded[indexedAttachment.index] : null;
  const directLabel = indexedAttachment?.label || indexedFile?.name || indexedFile?.stored_name || text;

  return (
    <div className="text-center small text-muted fst-italic px-2 my-1 d-flex flex-column align-items-center" style={{ gap: '0.35rem' }}>
      <div>{text}</div>
      {indexedFile && indexedAttachment ? (
        <SystemAttachmentChip
          boardId={boardId}
          cardId={cardId}
          file={indexedFile}
          index={indexedAttachment.index}
          label={directLabel}
        />
      ) : null}
    </div>
  );
}

function ChatBubble({ msg, compact = false, boardId, cardId, filesUploaded = [] }) {
  const { role, text, files } = msg;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  if (role === 'system') {
    return <SystemMessage msg={msg} boardId={boardId} cardId={cardId} filesUploaded={filesUploaded} />;
  }
  const isUser = role === 'user';
  return (
    <>
      <div className={`d-flex mb-2 ${isUser ? 'justify-content-end' : ''}`}>
        <div
          className={`px-2 py-2 rounded-3 small d-flex align-items-start ${isUser ? 'flex-row-reverse' : ''}`}
          style={{
            maxWidth: '82%',
            background: isUser
              ? 'var(--bs-secondary-bg, #e9ecef)'
              : 'var(--bs-primary-bg-subtle, #cfe2ff)',
            border: isUser ? 'none' : '1px solid var(--bs-border-color, #dee2e6)',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
            overflowX: 'hidden',
            lineHeight: 1.4,
            gap: '0.45rem',
          }}
        >
          <ChatIconShell>
            {isUser ? <UserBubbleIcon /> : <AssistantBubbleIcon />}
          </ChatIconShell>
          <div className="flex-grow-1 min-w-0">
            <ChatMessageText text={text} onOverflowChange={setIsOverflowing} />
            {isOverflowing ? (
              <div className={`d-flex mt-1 ${isUser ? 'justify-content-start' : 'justify-content-end'}`}>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 lh-1 text-decoration-none"
                  onClick={() => setIsModalOpen(true)}
                  title="View full message"
                  aria-label="View full message"
                >
                  ...
                </button>
              </div>
            ) : null}
            {(files ?? []).map((f, i) => (
              <div key={i} className="badge bg-secondary-subtle text-secondary-emphasis mt-1 d-block">{f}</div>
            ))}
          </div>
        </div>
      </div>
      {isModalOpen ? (
        <MessageModal
          title={isUser ? 'User Message' : 'Assistant Message'}
          text={typeof text === 'string' ? text : ''}
          onClose={() => setIsModalOpen(false)}
        />
      ) : null}
    </>
  );
}

function toChipPreview(text, maxLength = 96) {
  const lines = String(text ?? '')
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean);
  const raw = lines.at(-1) || String(text ?? '').trim();
  if (!raw) {
    return '';
  }
  const normalizedMaxLength = Number.isInteger(maxLength) && maxLength > 8 ? maxLength : 96;
  return raw.length > normalizedMaxLength
    ? `${raw.slice(0, normalizedMaxLength - 3)}...`
    : raw;
}

function WorkingBubble({ copilotOutput = '', copilotTools = '', compact = false }) {
  const [activeChipKey, setActiveChipKey] = useState('');
  const chipPreviewLength = compact ? 44 : 96;
  const liveOutput = typeof copilotOutput === 'string' ? copilotOutput.trim() : '';
  const liveTools = typeof copilotTools === 'string' ? copilotTools.trim() : '';
  const chips = [
    liveOutput ? { key: 'output', label: 'Copilot Output', value: toChipPreview(liveOutput, chipPreviewLength), fullText: liveOutput } : null,
    liveTools ? { key: 'tools', label: 'Analysing', value: toChipPreview(liveTools, chipPreviewLength), fullText: liveTools } : null,
  ].filter(Boolean);
  const activeChip = compact ? null : (chips.find((chip) => chip.key === activeChipKey) ?? null);

  return (
    <div className="d-flex mb-2 w-100">
      <div
        className="px-2 py-1 rounded-3 small text-muted fst-italic d-inline-flex flex-column align-items-stretch w-100"
        style={{
          maxWidth: '100%',
          background: 'var(--bs-light, #f8f9fa)',
          border: '1px solid var(--bs-border-color, #dee2e6)',
          gap: '0.45rem',
        }}
      >
        <div className="d-inline-flex align-items-center" style={{ gap: '0.45rem' }}>
          <ChatIconShell>
            <WorkingBubbleIcon />
          </ChatIconShell>
          <span>AI working...</span>
          <span
            className="spinner-border spinner-border-sm flex-shrink-0"
            role="status"
            aria-label="AI working"
            style={{ width: '0.75rem', height: '0.75rem', borderWidth: '0.12em' }}
          />
        </div>
        {chips.length > 0 ? (
          <div className="d-flex flex-wrap" style={{ gap: '0.35rem' }}>
            {chips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                className={`badge rounded-pill border text-body-emphasis ${activeChipKey === chip.key ? 'text-bg-primary' : 'text-bg-light'}`}
                title={chip.value}
                style={{
                  maxWidth: compact ? '100%' : '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => {
                  if (compact) {
                    return;
                  }
                  setActiveChipKey((prev) => (prev === chip.key ? '' : chip.key));
                }}
              >
                <span className={`board-chat-pane__chip-label${activeChipKey === chip.key || compact ? '' : ' board-chat-pane__chip-label--shimmer'}`}>
                  {chip.label}
                </span>
                <span className="board-chat-pane__chip-separator">: </span>
                <span className="board-chat-pane__chip-value">{chip.value}</span>
              </button>
            ))}
          </div>
        ) : null}
        {activeChip ? (
          <pre
            className="mb-0 rounded-2 p-2 small"
            style={{
              maxHeight: '12rem',
              overflow: 'auto',
              background: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(0,0,0,0.08)',
              color: 'var(--bs-body-color, #212529)',
              fontFamily: 'Consolas, "SFMono-Regular", Menlo, Monaco, monospace',
              fontStyle: 'normal',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {activeChip.fullText}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

function ChatComposer({ chatActions, placeholder, processing, turnId }) {
  const [text, setText] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const upload = (file) => {
    if (!file || processing) return;
    chatActions.uploadFileForChat(file, turnId).catch(() => {});
  };

  const send = () => {
    if (processing) return;
    const t = text.trim();
    if (!t) return;
    chatActions.sendChat(t, { turnId }).catch(() => {});
    setText('');
  };

  return (
    <div className="board-chat-pane__composer border-top p-2 d-flex flex-column gap-2 flex-shrink-0">
      <div
        className={`board-chat-pane__dropzone border rounded-3 p-2 small text-center${processing ? ' is-disabled' : dragActive ? ' is-active' : ''}`}
        role="button"
        tabIndex={0}
        aria-disabled={processing}
        onClick={() => { if (!processing) fileRef.current?.click(); }}
        onDragEnter={(e) => { e.preventDefault(); if (!processing) setDragActive(true); }}
        onDragOver={(e) => { e.preventDefault(); if (!processing) setDragActive(true); }}
        onDragLeave={(e) => { e.preventDefault(); if (!processing && e.currentTarget === e.target) setDragActive(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          upload(e.dataTransfer.files?.[0]);
        }}
        onKeyDown={(e) => {
          if (processing) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
      >
        Drop a file here or click to browse
        <input
          ref={fileRef}
          type="file"
          className="d-none"
          disabled={processing}
          onChange={(e) => {
            upload(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      <div className="board-chat-pane__input-row d-flex gap-2 align-items-end">
        <textarea
          ref={textareaRef}
          className="board-chat-pane__textarea form-control form-control-sm"
          rows={1}
          value={text}
          placeholder={placeholder ?? 'Send a message…'}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          style={{ resize: 'none', minHeight: '38px', maxHeight: '160px' }}
        />
        <button className="board-chat-pane__send btn btn-sm btn-primary flex-shrink-0" onClick={send} disabled={processing || !text.trim()}>
          <i className="bi bi-send" />
        </button>
      </div>
    </div>
  );
}

function makeTurnId() {
  return Math.random().toString(36).slice(2, 8).padEnd(6, '0');
}

function isPendingFileUploadMessage(msg) {
  if (!msg || msg.role !== 'system') return false;
  const text = typeof msg.text === 'string' ? msg.text.trim() : '';
  return /^file uploaded:/i.test(text);
}

export function ChatPane({ boardId, cardId, readOnly = false, compact = false }) {
  const chat = useChatState(boardId, cardId);
  const messages = chat?.messages ?? [];
  const processing = chat?.processing ?? false;
  const copilotOutput = chat?.copilotOutput ?? '';
  const copilotTools = chat?.copilotTools ?? '';
  const chatActions = chat?.chatActions ?? null;
  const boardSseClientId = chat?.boardSseClientId ?? null;
  const filesUploaded = chat?.filesUploaded ?? [];
  const messagesRef = useRef(null);
  const bottomRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const [draftTurnId, setDraftTurnId] = useState(() => makeTurnId());

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
    chatActions?.subscribeCopilotOutput,
    chatActions?.unsubscribeCopilotOutput,
    chatActions?.subscribeCopilotTools,
    chatActions?.unsubscribeCopilotTools,
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
    initialScrollDoneRef.current = false;
    shouldStickToBottomRef.current = true;
  }, [boardId, cardId]);

  useEffect(() => {
    if (initialScrollDoneRef.current) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      scrollToBottom('auto');
      shouldStickToBottomRef.current = true;
      initialScrollDoneRef.current = true;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [messages.length, processing, boardId, cardId]);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      scrollToBottom(messages.length > 0 || processing ? 'smooth' : 'auto');
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [messages.length, processing, copilotOutput, copilotTools]);

  useEffect(() => {
    const element = messagesRef.current;
    if (!element) {
      return undefined;
    }

    const observer = new MutationObserver(() => {
      if (!shouldStickToBottomRef.current) {
        return;
      }

      window.requestAnimationFrame(() => {
        scrollToBottom('auto');
      });
    });

    observer.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  if (!chat) return null;

  return (
    <div className="board-chat-pane">
      <div
        ref={messagesRef}
        className="board-chat-pane__messages p-2"
      >
        {messages.map((msg, i) => (
          <ChatBubble
            key={i}
            msg={msg}
            compact={compact}
            boardId={boardId}
            cardId={cardId}
            filesUploaded={filesUploaded}
          />
        ))}
        {processing && <WorkingBubble copilotOutput={copilotOutput} copilotTools={copilotTools} compact={compact} />}
        <div ref={bottomRef} />
      </div>
      {!readOnly && chatActions && <ChatComposer chatActions={chatActions} processing={processing} turnId={draftTurnId} />}
    </div>
  );
}
