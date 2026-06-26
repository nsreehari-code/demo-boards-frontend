import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CardChrome } from './sub/CardChrome.jsx';
import { useFileDrop } from '../../shared/FileUpload.jsx';
import { MessageWithAttachmentsInput } from '../../shared/MessageWithAttachmentsInput.jsx';
import { useCardState, useCardStateFilesData } from '../../../hooks/useCardState.js';
import { useChatConversation } from '../../../hooks/useChatConversation.js';
import { ensureCardFileUrl, getCardFileUrl } from '../../../lib/client.js';
import { getMessageTurnId } from '../../../lib/chatMessages.js';

const HISTORY_TURNS_PER_PAGE = 8;

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

function PostboxCardComponent({ spec = {}, variant = 'standard' }) {
  const { boardId, cardId, chrome = 'full', enableResize = false } = spec;
  const cardState = useCardState(boardId, cardId);
  const filesUploaded = useCardStateFilesData(boardId, cardId);
  const conv = useChatConversation(boardId, cardId, { historyTurnsPerPage: HISTORY_TURNS_PER_PAGE });
  const {
    chat,
    chatActions,
    historyMessages,
    liveMessages,
    hasMore,
    historyLoading,
    canLoadMore,
    draftTurnId,
    rotateDraftTurn,
    refreshLatest,
    showPrevious,
  } = conv;
  const [submitting, setSubmitting] = useState(false);
  const [viewMode, setViewMode] = useState('submissions');
  const composerRef = useRef(null);
  const messagesRef = useRef(null);

  // Clear the staged composer when switching cards. The chat data reset is owned
  // by useChatConversation.
  useEffect(() => {
    composerRef.current?.clear();
  }, [boardId, cardId]);

  const allMessages = useMemo(
    () => [...historyMessages, ...liveMessages],
    [historyMessages, liveMessages],
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

  const { dragActive, handlers: stageDropHandlers } = useFileDrop({
    onFiles: (files) => composerRef.current?.addFiles(files),
  });

  const handleSubmit = useCallback(async ({ text, files }) => {
    if (!chatActions) {
      return;
    }

    setSubmitting(true);
    try {
      const message = (typeof text === 'string' ? text.trim() : '') || 'na';
      await chatActions.sendChat(message, {
        turnId: draftTurnId,
        files,
      });
      rotateDraftTurn();
      try {
        await refreshLatest();
      } catch {
        // Non-fatal: the submission is stored; it will appear on next refresh.
      }
    } finally {
      setSubmitting(false);
    }
  }, [chatActions, draftTurnId, rotateDraftTurn, refreshLatest]);

  if (!cardState?.cardContent || !chat) return null;

  return (
    <CardChrome boardId={boardId} cardId={cardId} chrome={chrome} enableResize={enableResize}>
    <div className="board-postbox-card h-100 d-flex flex-column overflow-hidden">
      <div
        ref={messagesRef}
        className={`board-postbox-stage flex-grow-1 overflow-auto p-3${dragActive ? ' board-postbox-stage--dragging' : ''}`}
        {...stageDropHandlers}
      >
        {dragActive ? (
          <div className="board-postbox-stage__drophint">
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
            {hasMore && canLoadMore ? (
              <div className="d-flex justify-content-center mb-3">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={historyLoading}
                  onClick={() => showPrevious()}
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

      <MessageWithAttachmentsInput
        ref={composerRef}
        staged
        multiple
        disabled={submitting}
        requireAttachment={!allowMessageOnly}
        onSubmit={handleSubmit}
        placeholder={allowMessageOnly ? 'Write a message, attach files, or both' : 'Add comment (optional)'}
        className="border-top p-3 d-flex flex-column gap-3 flex-shrink-0"
        inputRowClassName="d-flex align-items-center gap-2"
        attachVariant="dropzone"
        dropzoneAs="button"
        dropzoneClassName="board-postbox-dropzone"
        dropzoneActiveClassName="board-postbox-dropzone--active"
        dropzoneContent={(
          <>
            <i className="bi bi-cloud-arrow-up board-postbox-dropzone__icon" />
            <span className="board-postbox-dropzone__title">Drag &amp; drop files here</span>
            <span className="board-postbox-dropzone__hint">or click to browse</span>
          </>
        )}
        inputClassName="form-control form-control-sm"
        submitClassName="btn btn-sm btn-primary flex-shrink-0"
        submitContent={submitting
          ? (allowMessageOnly ? 'Sending…' : 'Uploading…')
          : (allowMessageOnly ? 'Send' : 'Upload')}
      />
    </div>
    </CardChrome>
  );
}

export const PostboxCard = memo(PostboxCardComponent);
