import React, { memo } from 'react';
import BoardMarkdown from '../../BoardMarkdown.jsx';

function MarkdownComponent({ data }) {
  let text = '';
  if (typeof data === 'string') text = data;
  else if (data && typeof data === 'object' && data.text) text = data.text;
  else if (data != null) text = JSON.stringify(data, null, 2);
  if (!text) return null;

  return (
    <BoardMarkdown
      text={text}
      className="board-card-copy-block"
      style={{ color: 'var(--color-text)' }}
    />
  );
}

export const Markdown = memo(MarkdownComponent);

// `markdown` and `markup` are two explicit entries sharing one component
// (duplicate registration, no alias indirection).
export const markdownEntry = {
  kind: 'markdown',
  renderComponentFn: Markdown,
  meta: { showLabel: true, isReadonly: true },
};

export const markupEntry = {
  kind: 'markup',
  renderComponentFn: Markdown,
  meta: { showLabel: true, isReadonly: true },
};

export const entries = [markdownEntry, markupEntry];
