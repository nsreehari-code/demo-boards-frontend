import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCardState, useCardStateFilesData } from '../hooks/useCardState.js';
import { useChatState } from '../hooks/useChatState.js';
import { callBoardMcp, ensureCardFileUrl, getCardFileUrl } from '../lib/client.js';

const HISTORY_TURNS_PER_PAGE = 8;

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

function makeTurnId() {
  return Math.random().toString(36).slice(2, 8).padEnd(6, '0');
}

function normalizeCommentText(text) {
  const normalized = typeof text === 'string' ? text.trim() : '';
  if (!normalized) return '';
  return normalized.toLowerCase() === 'na' ? '' : normalized;
}

function formatFileSize(size) {
  const value = Number(size);
  if (!Number.isFinite(value) || value <= 0) {
    return 'Unknown size';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  const kb = value / 1024;
  if (kb < 1024) {
    return `${Math.max(1, Math.round(kb))} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(gb >= 100 ? 0 : 1)} GB`;
}

function formatTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function describeMimeType(file) {
  const mime = typeof file?.mime_type === 'string' ? file.mime_type.trim() : '';
  if (!mime) {
    return 'Unknown type';
  }
  return mime;
}

function groupMessagesByTurn(messages) {
  const groups = [];
  const groupByTurn = new Map();

  for (const msg of Array.isArray(messages) ? messages : []) {
    const role = typeof msg?.role === 'string' ? msg.role.trim().toLowerCase() : '';
    if (role !== 'user') {
      continue;
    }

    const turnId = getMessageTurnId(msg) || `__message-${groups.length}`;
    let group = groupByTurn.get(turnId);

    if (!group) {
      group = {
        turnId,
        comments: [],
        files: [],
        fileKeys: new Set(),
        createdAt: '',
      };
      groupByTurn.set(turnId, group);
      groups.push(group);
    }

    const createdAt = typeof msg?.updated_at === 'string' ? msg.updated_at : '';
    if (createdAt && !group.createdAt) {
      group.createdAt = createdAt;
    }

    const comment = normalizeCommentText(typeof msg?.text === 'string' ? msg.text : '');
    if (comment) {
      group.comments.push(comment);
    }

    const msgFiles = Array.isArray(msg?.files) ? msg.files : [];
    for (const file of msgFiles) {
      if (!file?.stored_name) {
        continue;
      }
      if (group.fileKeys.has(file.stored_name)) {
        continue;
      }
      group.fileKeys.add(file.stored_name);
      const index = Number.isInteger(file.file_idx) ? file.file_idx : group.files.length;
      const label = typeof file.name === 'string' && file.name.trim() ? file.name.trim() : file.stored_name;
      group.files.push({ index, label, file });
      if (!group.createdAt && typeof file.uploaded_at === 'string') {
        group.createdAt = file.uploaded_at;
      }
    }
  }

  return groups.filter((group) => group.comments.length > 0 || group.files.length > 0);
}

function buildFileViewEntries(files) {
  return (Array.isArray(files) ? files : [])
    .map((file, index) => ({
      index,
      file,
      uploadedAt: typeof file?.uploaded_at === 'string' ? file.uploaded_at : '',
    }))
    .filter((entry) => entry.file?.stored_name)
    .sort((left, right) => {
      if (left.uploadedAt && right.uploadedAt) {
        return right.uploadedAt.localeCompare(left.uploadedAt);
      }
      return right.index - left.index;
    });
}

function useChatSubscription(subscribeChat, unsubscribeChat, boardId, cardId, boardSseClientId) {
  useEffect(() => {
    if (!subscribeChat || !unsubscribeChat || !boardId || !cardId || !boardSseClientId) return;
    subscribeChat().catch(() => {});
    return () => {
      unsubscribeChat().catch(() => {});
    };
  }, [subscribeChat, unsubscribeChat, boardId, cardId, boardSseClientId]);
}

function SelectedFileChip({ file, onRemove }) {
  const name = typeof file?.name === 'string' && file.name.trim() ? file.name.trim() : 'Untitled file';
  const size = file?.size ? ` (${formatFileSize(file.size)})` : '';

  return (
    <span className="badge rounded-pill text-bg-light border d-inline-flex align-items-center gap-2 px-3 py-2 text-body-emphasis">
      <span className="text-truncate" style={{ maxWidth: '18rem' }}>{`${name}${size}`}</span>
      <button
        type="button"
        className="btn-close btn-close-sm"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
      />
    </span>
  );
}

function DownloadFileChip({ boardId, cardId, index, file, label }) {
  const [resolvedHref, setResolvedHref] = useState(() => {
    if (!file?.stored_name) return '';
    return getCardFileUrl(boardId, cardId, index, file.stored_name);
  });

  useEffect(() => {
    const storedName = typeof file?.stored_name === 'string' ? file.stored_name : '';
    if (!storedName) {
      setResolvedHref('');
      return undefined;
    }

    const immediateHref = getCardFileUrl(boardId, cardId, index, storedName);
    if (immediateHref) {
      setResolvedHref(immediateHref);
      return undefined;
    }

    let cancelled = false;
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
  }, [boardId, cardId, index, file]);

  const displayLabel = label || file?.name || file?.stored_name || `Attachment #${index}`;

  if (!resolvedHref) {
    return (
      <span className="board-postbox-chip board-postbox-chip--static badge rounded-pill px-3 py-2">{displayLabel}</span>
    );
  }

  return (
    <a
      href={resolvedHref}
      className="board-postbox-chip badge rounded-pill text-decoration-none px-3 py-2"
      target="_blank"
      rel="noreferrer"
      title={displayLabel}
    >
      <i className="bi bi-paperclip me-1" />
      {displayLabel}
    </a>
  );
}

function SubmissionBubble({ boardId, cardId, submission }) {
  const comment = submission.comments.join('\n\n').trim();
  const submittedAt = formatTimestamp(submission.createdAt);

  return (
    <div className="board-postbox-submission rounded-4 p-3">
      <div className="board-postbox-submission__top">
        <div className="d-flex flex-wrap gap-2 align-items-start">
          {submission.files.map((entry) => (
            <DownloadFileChip
              key={`${submission.turnId}-${entry.index}-${entry.file?.stored_name || entry.label}`}
              boardId={boardId}
              cardId={cardId}
              index={entry.index}
              file={entry.file}
              label={entry.label}
            />
          ))}
        </div>
      </div>
      {comment || submittedAt ? (
        <div className="board-postbox-submission__meta">
          <span className="board-postbox-submission__comment-text">{comment}</span>
          {submittedAt ? (
            <span className="board-postbox-submission__time">
              <i className="bi bi-clock-history me-1" />
              {submittedAt}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FlattenedFilesView({ files }) {
  if (files.length === 0) {
    return <div className="text-muted small">No uploaded files yet.</div>;
  }

  return (
    <div className="table-responsive">
      <table className="table table-sm board-postbox-file-table align-middle mb-0">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Type</th>
            <th scope="col">Size</th>
            <th scope="col">Uploaded</th>
          </tr>
        </thead>
        <tbody>
          {files.map((entry) => {
            const fileName = entry.file?.name || entry.file?.stored_name || `Attachment #${entry.index}`;
            const uploadedAt = formatTimestamp(entry.file?.uploaded_at);
            return (
              <tr key={`${entry.index}-${entry.file?.stored_name || entry.file?.name || 'file'}`}>
                <td className="board-postbox-file-table__name">{fileName}</td>
                <td>{describeMimeType(entry.file)}</td>
                <td className="text-nowrap">{formatFileSize(entry.file?.size)}</td>
                <td className="text-nowrap">{uploadedAt || 'Unknown time'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PostboxCardComponent({ boardId, cardId, variant = 'standard' }) {
  const cardState = useCardState(boardId, cardId);
  const filesUploaded = useCardStateFilesData(boardId, cardId);
  const chat = useChatState(boardId, cardId);
  const messages = chat?.messages ?? [];
  const chatActions = chat?.chatActions ?? null;
  const boardSseClientId = chat?.boardSseClientId ?? null;
  const [commentText, setCommentText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [composerDragActive, setComposerDragActive] = useState(false);
  const [viewMode, setViewMode] = useState('submissions');
  const [liveMessages, setLiveMessages] = useState([]);
  const [historyMessages, setHistoryMessages] = useState([]);
  const [historyAnchorTurnId, setHistoryAnchorTurnId] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [draftTurnId, setDraftTurnId] = useState(() => makeTurnId());
  const fileRef = useRef(null);
  const messagesRef = useRef(null);
  const liveKeyRef = useRef('');
  const lastLoadedAnchorRef = useRef('');

  useChatSubscription(
    chatActions?.subscribeChat,
    chatActions?.unsubscribeChat,
    boardId,
    cardId,
    boardSseClientId,
  );

  useEffect(() => {
    setSelectedFiles([]);
    setCommentText('');
    setLiveMessages([]);
    setHistoryMessages([]);
    setHistoryAnchorTurnId('');
    setHistoryHasMore(false);
    setHistoryLoading(false);
    setDraftTurnId(makeTurnId());
    liveKeyRef.current = '';
    lastLoadedAnchorRef.current = '';
  }, [boardId, cardId]);

  useEffect(() => {
    const key = `${boardId}::${cardId}`;
    setLiveMessages((prev) => {
      if (liveKeyRef.current !== key) {
        liveKeyRef.current = key;
        return mergeLiveMessages([], messages);
      }
      return mergeLiveMessages(prev, messages);
    });
  }, [boardId, cardId, messages]);

  const liveForDisplay = useMemo(
    () => liveMessages.map((entry) => entry.msg),
    [liveMessages],
  );

  const firstLiveTurnId = useMemo(
    () => getFirstTurnId(liveForDisplay),
    [liveForDisplay],
  );

  useEffect(() => {
    if (historyAnchorTurnId || !firstLiveTurnId) {
      return;
    }
    setHistoryAnchorTurnId(firstLiveTurnId);
  }, [historyAnchorTurnId, firstLiveTurnId]);

  const loadHistory = useCallback(async (beforeTurnId) => {
    if (!beforeTurnId || historyLoading) {
      return;
    }

    setHistoryLoading(true);
    try {
      const incoming = await fetchChatHistoryBeforeTurn(boardId, cardId, beforeTurnId, HISTORY_TURNS_PER_PAGE);
      setHistoryMessages((current) => mergeMessageArrays(incoming, current));
      setHistoryHasMore(countDistinctTurns(incoming) >= HISTORY_TURNS_PER_PAGE);
    } finally {
      setHistoryLoading(false);
    }
  }, [boardId, cardId, historyLoading]);

  useEffect(() => {
    if (!historyAnchorTurnId || lastLoadedAnchorRef.current === historyAnchorTurnId) {
      return;
    }

    lastLoadedAnchorRef.current = historyAnchorTurnId;
    void loadHistory(historyAnchorTurnId);
  }, [historyAnchorTurnId, loadHistory]);

  useEffect(() => {
    if (!messages.length) {
      return;
    }

    const lastTurnId = getMessageTurnId(messages[messages.length - 1]);
    if (lastTurnId && lastTurnId === draftTurnId) {
      setDraftTurnId(makeTurnId());
    }
  }, [messages, draftTurnId]);

  const allMessages = useMemo(
    () => [...historyMessages, ...liveForDisplay],
    [historyMessages, liveForDisplay],
  );

  const submissions = useMemo(
    () => groupMessagesByTurn(allMessages),
    [allMessages],
  );

  const flattenedFiles = useMemo(
    () => buildFileViewEntries(filesUploaded),
    [filesUploaded],
  );

  useEffect(() => {
    const element = messagesRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [submissions.length, viewMode]);

  const allowMessageOnly = variant === 'universal';
  const canSubmit = (selectedFiles.length > 0 || (allowMessageOnly && commentText.trim().length > 0)) && !submitting;

  const addFiles = useCallback((incomingFiles) => {
    const nextFiles = Array.from(incomingFiles || []).filter(Boolean);
    if (nextFiles.length === 0) {
      return;
    }

    setSelectedFiles((current) => {
      const merged = [...current];
      for (const file of nextFiles) {
        const exists = merged.some((entry) => (
          entry.name === file.name
          && entry.size === file.size
          && entry.lastModified === file.lastModified
        ));
        if (!exists) {
          merged.push(file);
        }
      }
      return merged;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!chatActions || !canSubmit) {
      return;
    }

    setSubmitting(true);
    try {
      const text = commentText.trim() || 'na';
      await chatActions.sendChat(text, {
        turnId: draftTurnId,
        files: selectedFiles,
      });
      setCommentText('');
      setSelectedFiles([]);
      setDraftTurnId(makeTurnId());
      try {
        const latest = await fetchChatHistoryBeforeTurn(boardId, cardId, '', HISTORY_TURNS_PER_PAGE);
        if (latest.length > 0) {
          setHistoryMessages((current) => mergeMessageArrays(current, latest));
        }
      } catch {
        // Non-fatal: the submission is stored; it will appear on next refresh.
      }
    } finally {
      setSubmitting(false);
    }
  }, [boardId, cardId, canSubmit, chatActions, commentText, draftTurnId, selectedFiles]);

  if (!cardState?.cardContent || !chat) return null;

  const title = cardState.cardContent.meta?.title ?? cardId;
  const historyBeforeTurnId = historyMessages.length > 0
    ? getFirstTurnId(historyMessages)
    : historyAnchorTurnId;

  return (
    <div className="board-postbox-card h-100 d-flex flex-column overflow-hidden">
      <div className="board-ingest-card__header d-none align-items-center justify-content-between gap-2 px-2 py-2 border-bottom">
        <div className="fw-semibold text-truncate flex-grow-1 min-w-0">{title}</div>
      </div>

      <div
        ref={messagesRef}
        className={`flex-grow-1 overflow-auto p-3 ${dragActive ? 'border border-primary border-2' : ''}`}
        style={{ background: dragActive ? 'rgba(13, 110, 253, 0.08)' : 'transparent' }}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget === event.target) {
            setDragActive(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          addFiles(event.dataTransfer.files);
        }}
      >
        {dragActive ? (
          <div className="rounded-4 border border-primary border-dashed p-4 mb-3 text-center text-primary bg-white">
            Drop files to stage this submission
          </div>
        ) : null}

        <div className="board-postbox-viewtoggle d-flex justify-content-end mb-2">
          <div className="btn-group btn-group-sm" role="group" aria-label="Postbox view mode">
            <button
              type="button"
              className={`board-postbox-viewbtn ${viewMode === 'submissions' ? 'board-postbox-viewbtn--active' : ''}`}
              onClick={() => setViewMode('submissions')}
              title="Grouped submissions"
              aria-label="Grouped submissions"
              aria-pressed={viewMode === 'submissions'}
            >
              <i className="bi bi-collection" />
            </button>
            <button
              type="button"
              className={`board-postbox-viewbtn ${viewMode === 'files' ? 'board-postbox-viewbtn--active' : ''}`}
              onClick={() => setViewMode('files')}
              title="Flat file list"
              aria-label="Flat file list"
              aria-pressed={viewMode === 'files'}
            >
              <i className="bi bi-list-ul" />
            </button>
          </div>
        </div>

        {viewMode === 'submissions' ? (
          <>
            {historyHasMore && historyBeforeTurnId ? (
              <div className="d-flex justify-content-center mb-3">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={historyLoading}
                  onClick={() => void loadHistory(historyBeforeTurnId)}
                >
                  {historyLoading ? 'Loading…' : 'Show previous submissions'}
                </button>
              </div>
            ) : null}

            {submissions.length === 0 ? (
              <div className="h-100 d-flex align-items-center justify-content-center text-center text-muted small px-4">
                {allowMessageOnly
                  ? 'Write a message or drop files using the composer below to get started.'
                  : 'Drag files anywhere in this pane or use the composer below to submit the first evidence bundle.'}
              </div>
            ) : (
              <div className="d-flex flex-column gap-3">
                {submissions.map((submission) => (
                  <SubmissionBubble
                    key={submission.turnId}
                    boardId={boardId}
                    cardId={cardId}
                    submission={submission}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <FlattenedFilesView files={flattenedFiles} />
        )}
      </div>

      <div className="border-top p-3 d-flex flex-column gap-3 flex-shrink-0">
        <input
          ref={fileRef}
          type="file"
          multiple
          className="d-none"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
        />

        <button
          type="button"
          className={`board-postbox-dropzone ${composerDragActive ? 'board-postbox-dropzone--active' : ''}`}
          onClick={() => fileRef.current?.click()}
          disabled={submitting}
          onDragEnter={(event) => {
            event.preventDefault();
            setComposerDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setComposerDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget === event.target) {
              setComposerDragActive(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setComposerDragActive(false);
            addFiles(event.dataTransfer.files);
          }}
        >
          <i className="bi bi-cloud-arrow-up board-postbox-dropzone__icon" />
          <span className="board-postbox-dropzone__title">Drag &amp; drop files here</span>
          <span className="board-postbox-dropzone__hint">or click to browse</span>
        </button>

        {selectedFiles.length > 0 ? (
          <div className="d-flex flex-wrap gap-2">
            {selectedFiles.map((file, index) => (
              <SelectedFileChip
                key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                file={file}
                onRemove={() => {
                  setSelectedFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
                }}
              />
            ))}
          </div>
        ) : null}

        <div className="d-flex align-items-center gap-2">
          <input
            type="text"
            className="form-control form-control-sm"
            value={commentText}
            placeholder={allowMessageOnly ? 'Write a message, attach files, or both' : 'Add comment (optional)'}
            onChange={(event) => setCommentText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canSubmit) {
                event.preventDefault();
                void handleSubmit();
              }
            }}
          />
          <button
            type="button"
            className="btn btn-sm btn-primary flex-shrink-0"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            {submitting
              ? (allowMessageOnly ? 'Sending…' : 'Uploading…')
              : (allowMessageOnly ? 'Send' : 'Upload')}
          </button>
        </div>
      </div>
    </div>
  );
}

export const PostboxCard = memo(PostboxCardComponent);

export const UniversalPostboxCard = (props) => <PostboxCard {...props} variant="universal" />;
