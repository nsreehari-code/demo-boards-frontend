import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { CardChrome } from './sub/CardChrome.jsx';
import { useFileDrop } from '../../shared/FileUpload.jsx';
import { MessageWithAttachmentsInput } from '../../shared/MessageWithAttachmentsInput.jsx';
import { useCardState } from '../../../hooks/useCardState.js';
import { useCardFileUrl } from '../../../hooks/useCardFileUrl.js';

const EMPTY_ARRAY = Object.freeze([]);

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

function DownloadFileChip({ boardId, cardId, index, file }) {
  const resolvedHref = useCardFileUrl(boardId, cardId, index, file);
  const displayLabel = file?.name || file?.stored_name || `Attachment #${index}`;

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

function FilegroupBubble({ boardId, cardId, group, files }) {
  const message = typeof group?.message === 'string' ? group.message.trim() : '';
  const submittedAt = formatTimestamp(group?.created_at);
  const fileIdxs = Array.isArray(group?.file_idxs) ? group.file_idxs : EMPTY_ARRAY;

  return (
    <div className="board-postbox-submission rounded-4 p-3">
      <div className="board-postbox-submission__top">
        <div className="d-flex flex-wrap gap-2 align-items-start">
          {fileIdxs.map((fileIdx) => {
            const file = files[fileIdx];
            if (!file?.stored_name) {
              return null;
            }
            return (
              <DownloadFileChip
                key={`${fileIdx}-${file.stored_name}`}
                boardId={boardId}
                cardId={cardId}
                index={fileIdx}
                file={file}
              />
            );
          })}
        </div>
      </div>
      {message || submittedAt ? (
        <div className="board-postbox-submission__meta">
          <span className="board-postbox-submission__comment-text">{message}</span>
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

function PostboxCardComponent({ spec = {} }) {
  const { boardId, cardId, chrome = 'full', enableResize = false } = spec;
  const cardState = useCardState(boardId, cardId);
  const [submitting, setSubmitting] = useState(false);
  const composerRef = useRef(null);
  const feedRef = useRef(null);

  const cardData = cardState?.cardData;
  const files = Array.isArray(cardData?.files) ? cardData.files : EMPTY_ARRAY;
  const filegroups = Array.isArray(cardData?.filegroups) ? cardData.filegroups : EMPTY_ARRAY;
  const uploadCardFilesMultiple = cardState?.cardActions?.uploadCardFilesMultiple;

  // Reset the staged composer when switching cards.
  useEffect(() => {
    composerRef.current?.clear();
  }, [boardId, cardId]);

  // Keep the newest submission in view as the feed grows.
  useEffect(() => {
    const element = feedRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
  }, [filegroups.length]);

  const { dragActive, handlers: stageDropHandlers } = useFileDrop({
    onFiles: (dropped) => composerRef.current?.addFiles(dropped),
  });

  const handleSubmit = useCallback(async ({ text, files: staged }) => {
    if (!uploadCardFilesMultiple || !Array.isArray(staged) || staged.length === 0) {
      return;
    }
    setSubmitting(true);
    try {
      const message = typeof text === 'string' ? text.trim() : '';
      await uploadCardFilesMultiple(staged, message);
      composerRef.current?.clear();
    } finally {
      setSubmitting(false);
    }
  }, [uploadCardFilesMultiple]);

  if (!cardState?.cardContent) return null;

  return (
    <CardChrome boardId={boardId} cardId={cardId} chrome={chrome} enableResize={enableResize}>
      <div className="board-postbox-card h-100 d-flex flex-column overflow-hidden">
        <div
          ref={feedRef}
          className={`board-postbox-stage flex-grow-1 overflow-auto p-3${dragActive ? ' board-postbox-stage--dragging' : ''}`}
          {...stageDropHandlers}
        >
          {dragActive ? (
            <div className="board-postbox-stage__drophint">
              Drop files to stage this submission
            </div>
          ) : null}

          {filegroups.length === 0 ? (
            <div className="h-100 d-flex align-items-center justify-content-center text-center text-muted small px-4">
              Drag files anywhere in this pane or use the composer below to submit the first evidence bundle.
            </div>
          ) : (
            <div className="d-flex flex-column gap-3">
              {filegroups.map((group, groupIndex) => (
                <FilegroupBubble
                  key={groupIndex}
                  boardId={boardId}
                  cardId={cardId}
                  group={group}
                  files={files}
                />
              ))}
            </div>
          )}
        </div>

        <MessageWithAttachmentsInput
          ref={composerRef}
          staged
          multiple
          disabled={submitting || !uploadCardFilesMultiple}
          requireAttachment
          onSubmit={handleSubmit}
          placeholder="Add comment (optional)"
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
          submitContent={submitting ? 'Uploading…' : 'Upload'}
        />
      </div>
    </CardChrome>
  );
}

export const PostboxCard = memo(PostboxCardComponent);
