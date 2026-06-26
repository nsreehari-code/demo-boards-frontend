import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { FileUpload } from './FileUpload.jsx';
import { formatFileSize } from '../../lib/format.js';

/**
 * Shared "message + attachments" composer.
 *
 * Combines a text field, the shared {@link FileUpload} control and (optionally)
 * a removable preview of staged files behind a single submit action. It owns
 * its own text and staged-file state so consumers only provide an `onSubmit`
 * (and, for the immediate model, an `onAttach`) callback.
 *
 * Two attachment models are supported:
 *  - `staged` (default): selected/dropped files are kept as chips and handed to
 *    `onSubmit({ text, files })` together when the user submits.
 *  - immediate (`staged={false}`): each selection is forwarded to `onAttach`
 *    right away and `onSubmit` only carries the text.
 *
 * The forwarded ref exposes `{ addFiles(fileList), clear(), focus() }` so an
 * external drop target (e.g. a surrounding drop area) can stage files too.
 */

function mergeFiles(current, incoming) {
  const merged = [...current];
  for (const file of incoming) {
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
}

function DefaultAttachmentChip({ file, onRemove, disabled }) {
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
        disabled={disabled}
      />
    </span>
  );
}

export const MessageWithAttachmentsInput = forwardRef(function MessageWithAttachmentsInput({
  onSubmit,
  onAttach,
  staged = true,
  multiple = false,
  disabled = false,
  accept,
  requireText = false,
  requireAttachment = false,
  multiline = false,
  autoResize,
  placeholder = '',
  submitOnEnter = true,
  className = '',
  inputRowClassName = '',
  attachVariant = 'dropzone',
  dropzoneAs = 'div',
  dropzoneClassName = '',
  dropzoneActiveClassName = '',
  dropzoneDisabledClassName = '',
  dropzoneContent = null,
  attachButtonClassName = '',
  attachButtonContent = null,
  attachButtonProps = {},
  inputClassName = '',
  inputProps = {},
  submitClassName = '',
  submitContent = null,
  submitProps = {},
  chipsClassName = 'd-flex flex-wrap gap-2',
  renderChip,
}, ref) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const textRef = useRef(null);

  const shouldAutoResize = autoResize ?? multiline;

  useEffect(() => {
    if (!shouldAutoResize) return;
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text, shouldAutoResize]);

  const addFiles = useCallback((incoming) => {
    const next = Array.from(incoming || []).filter(Boolean);
    if (next.length === 0) return;
    const accepted = multiple ? next : next.slice(0, 1);
    if (staged) {
      setFiles((current) => mergeFiles(current, accepted));
    } else {
      onAttach?.(accepted);
    }
  }, [staged, multiple, onAttach]);

  const removeFileAt = useCallback((index) => {
    setFiles((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }, []);

  const clear = useCallback(() => {
    setText('');
    setFiles([]);
  }, []);

  useImperativeHandle(ref, () => ({
    addFiles,
    clear,
    focus: () => textRef.current?.focus(),
  }), [addFiles, clear]);

  const trimmed = text.trim();
  const hasText = trimmed.length > 0;
  const hasFiles = files.length > 0;
  let meetsContent;
  if (requireText && requireAttachment) {
    meetsContent = hasText && hasFiles;
  } else if (requireText) {
    meetsContent = hasText;
  } else if (requireAttachment) {
    meetsContent = hasFiles;
  } else {
    meetsContent = hasText || hasFiles;
  }
  const canSubmit = meetsContent && !disabled && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    const payload = { text: trimmed, files: [...files] };
    setBusy(true);
    try {
      await Promise.resolve(onSubmit?.(payload));
    } catch {
      setBusy(false);
      return;
    }
    setBusy(false);
    setText('');
    setFiles([]);
  };

  const handleKeyDown = (event) => {
    if (!submitOnEnter) return;
    if (event.key === 'Enter' && (!multiline || !event.shiftKey)) {
      event.preventDefault();
      void submit();
    }
  };

  const commonInputProps = {
    ref: textRef,
    className: inputClassName,
    value: text,
    placeholder,
    onChange: (event) => setText(event.target.value),
    onKeyDown: handleKeyDown,
    ...inputProps,
  };

  const inputEl = multiline
    ? <textarea rows={1} {...commonInputProps} />
    : <input type="text" {...commonInputProps} />;

  const dropzoneEl = attachVariant === 'dropzone' ? (
    <FileUpload
      variant="dropzone"
      as={dropzoneAs}
      multiple={multiple}
      accept={accept}
      disabled={disabled}
      onFiles={addFiles}
      className={dropzoneClassName}
      activeClassName={dropzoneActiveClassName}
      disabledClassName={dropzoneDisabledClassName}
    >
      {dropzoneContent}
    </FileUpload>
  ) : null;

  const attachButtonEl = attachVariant === 'button' ? (
    <FileUpload
      variant="dropzone"
      as="button"
      enableDrop={false}
      multiple={multiple}
      accept={accept}
      disabled={disabled}
      onFiles={addFiles}
      className={attachButtonClassName}
      {...attachButtonProps}
    >
      {attachButtonContent}
    </FileUpload>
  ) : null;

  return (
    <div className={className}>
      {dropzoneEl}

      {staged && hasFiles ? (
        <div className={chipsClassName}>
          {files.map((file, index) => (
            renderChip
              ? renderChip({ file, index, disabled, onRemove: () => removeFileAt(index) })
              : (
                <DefaultAttachmentChip
                  key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                  file={file}
                  disabled={disabled}
                  onRemove={() => removeFileAt(index)}
                />
              )
          ))}
        </div>
      ) : null}

      <div className={inputRowClassName}>
        {attachButtonEl}
        {inputEl}
        <button
          type="button"
          className={submitClassName}
          onClick={() => void submit()}
          disabled={!canSubmit}
          {...submitProps}
        >
          {submitContent}
        </button>
      </div>
    </div>
  );
});

export default MessageWithAttachmentsInput;
