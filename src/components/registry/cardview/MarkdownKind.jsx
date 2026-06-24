import React, { memo } from 'react';
import BoardMarkdown from '../../shared/BoardMarkdown.jsx';

function MarkdownKindComponent({ data }) {
  const text = typeof data === 'string' ? data : '';
  if (!text) return null;

  return (
    <BoardMarkdown
      text={text}
      className="board-card-copy-block"
      style={{ color: 'var(--color-text)' }}
    />
  );
}

export const MarkdownKind = memo(MarkdownKindComponent);
