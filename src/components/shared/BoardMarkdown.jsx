import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const COMPONENTS = {
  a: ({ node, ...props }) => (
    <a className="link-primary text-decoration-none" target="_blank" rel="noreferrer" {...props} />
  ),
  table: ({ node, ...props }) => (
    <div className="table-responsive my-2">
      <table className="table table-sm table-striped align-middle mb-0 board-data-table" {...props} />
    </div>
  ),
  img: ({ node, ...props }) => (
    <img className="img-fluid rounded my-2" style={{ border: '1px solid var(--color-border)' }} loading="lazy" {...props} />
  ),
};

export default function BoardMarkdown({ text, className = '', style }) {
  const source = typeof text === 'string'
    ? text
    : (text && typeof text === 'object' && typeof text.text === 'string' ? text.text : '');

  const normalized = source
    .replace(/\s*\[(\d+)\]\((https?:\/\/[^)]+)\)/g, '')
    .replace(/\s+$/gm, '')
    .trim();

  if (!normalized) return null;

  return (
    <div className={`board-markdown ${className}`.trim()} style={style}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
