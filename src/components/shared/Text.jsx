import React from 'react';

/**
 * Reusable text / file-link renderer.
 *
 * Props:
 *   value          – string copy, or a file array when format === 'file-links'
 *   format         – 'default' | 'file-links'
 *   style          – 'default' | 'muted' | 'muted-italic' | 'heading'
 *   hideIfEmpty    – render nothing when value is empty
 *   resolveFileUrl – (index, file) => href|undefined, used for 'file-links'
 */
export function Text({ value, format = 'default', style = 'default', hideIfEmpty = false, resolveFileUrl }) {
  if (hideIfEmpty && (value == null || value === '')) return null;

  if (format === 'file-links') {
    if (!Array.isArray(value) || value.length === 0) {
      return <div className="board-text-muted small">No files uploaded</div>;
    }
    return (
      <div>
        {value.map((file, index) => {
          if (!file?.stored_name) return null;
          const name = file.name ?? file.stored_name;
          const size = file.size ? ` (${Math.round(file.size / 1024)}KB)` : '';
          const href = resolveFileUrl?.(index, file);
          return (
            <div key={`${file.stored_name}-${index}`} className="mb-2">
              {href ? (
                <a href={href} className="btn btn-sm btn-outline-secondary board-file-link">{name}{size}</a>
              ) : (
                <span className="btn btn-sm btn-outline-secondary board-file-link disabled">{name}{size}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const Tag = style === 'heading' ? 'h4' : 'div';
  const className = style === 'muted'
    ? 'board-text-muted small'
    : style === 'muted-italic'
      ? 'board-text-muted small fst-italic'
      : style === 'heading'
        ? 'fw-bold'
        : 'small';
  return <Tag className={`${className} board-card-copy-block`}>{value != null ? String(value) : ''}</Tag>;
}
