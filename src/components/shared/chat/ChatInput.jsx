import React from 'react';
import { MessageWithAttachmentsInput } from '../MessageWithAttachmentsInput.jsx';

function ChatAttachIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.2a2 2 0 0 1-2.82-2.83l8.48-8.48" />
    </svg>
  );
}

/**
 * Chat message composer with file attachments. Purely prop-driven: it calls the
 * supplied `chatActions` to upload files and send text for the given `turnId`.
 */
export const ChatInput = React.memo(function ChatInput({
  chatActions,
  placeholder,
  processing,
  turnId,
  cardId,
  variant = 'default',
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

export default ChatInput;
