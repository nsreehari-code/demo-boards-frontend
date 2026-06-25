import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';

/**
 * Shared file upload / attachment control.
 *
 * Centralises the file-picker + drag-and-drop behaviour that used to be
 * re-implemented inline across the board config import, the chat composer and
 * the postbox card. The control always normalises the selected/dropped files
 * into an array and hands it to `onFiles`.
 *
 * Variants:
 *  - `dropzone` (default): renders a clickable surface that opens the native
 *    file picker and (optionally) accepts dropped files. Render the visible
 *    content as children. Use `as="button"` for a real `<button>` (so CSS
 *    `:disabled`/`:hover` rules apply) or the default `as="div"` for a
 *    keyboard-accessible `role="button"` surface.
 *  - `input`: renders only the hidden `<input>` element. Trigger the picker
 *    imperatively via the forwarded ref's `open()` method.
 *
 * The forwarded ref exposes `{ open(), input }`.
 */

function toFileArray(fileList) {
  return Array.from(fileList || []).filter(Boolean);
}

/**
 * Hook providing drag-and-drop file handling for an arbitrary drop target.
 * Returns the `dragActive` flag and the handlers to spread onto the element.
 */
export function useFileDrop({ onFiles, disabled = false } = {}) {
  const [dragActive, setDragActive] = useState(false);

  const handlers = {
    onDragEnter: (event) => {
      event.preventDefault();
      if (!disabled) setDragActive(true);
    },
    onDragOver: (event) => {
      event.preventDefault();
      if (!disabled) setDragActive(true);
    },
    onDragLeave: (event) => {
      event.preventDefault();
      if (!disabled && event.currentTarget === event.target) setDragActive(false);
    },
    onDrop: (event) => {
      event.preventDefault();
      setDragActive(false);
      if (disabled) return;
      const files = toFileArray(event.dataTransfer?.files);
      if (files.length > 0) onFiles?.(files);
    },
  };

  return { dragActive, setDragActive, handlers };
}

export const FileUpload = forwardRef(function FileUpload({
  onFiles,
  accept,
  multiple = false,
  disabled = false,
  variant = 'dropzone',
  as = 'div',
  className = '',
  activeClassName = '',
  disabledClassName = '',
  enableDrop = true,
  children,
  ...rest
}, ref) {
  const inputRef = useRef(null);

  const open = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  useImperativeHandle(ref, () => ({
    open,
    get input() { return inputRef.current; },
  }), [open]);

  const emit = useCallback((fileList) => {
    if (disabled) return;
    const files = toFileArray(fileList);
    if (files.length === 0) return;
    onFiles?.(files);
  }, [disabled, onFiles]);

  const { dragActive, handlers: dropHandlers } = useFileDrop({ onFiles: emit, disabled });

  const input = (
    <input
      ref={inputRef}
      type="file"
      className="d-none"
      accept={accept}
      multiple={multiple}
      disabled={disabled}
      onChange={(event) => {
        emit(event.target.files);
        event.target.value = '';
      }}
    />
  );

  if (variant === 'input') {
    return input;
  }

  const classes = [
    className,
    dragActive ? activeClassName : '',
    disabled ? disabledClassName : '',
  ].filter(Boolean).join(' ');

  const dropProps = enableDrop ? dropHandlers : {};

  if (as === 'button') {
    return (
      <>
        <button
          type="button"
          className={classes}
          onClick={open}
          disabled={disabled}
          {...dropProps}
          {...rest}
        >
          {children}
        </button>
        {input}
      </>
    );
  }

  return (
    <>
      <div
        className={classes}
        role="button"
        tabIndex={0}
        aria-disabled={disabled || undefined}
        onClick={open}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
          }
        }}
        {...dropProps}
        {...rest}
      >
        {children}
      </div>
      {input}
    </>
  );
});

export default FileUpload;
