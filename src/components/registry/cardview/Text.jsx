import React from 'react';

// Default text renderer and the registry fallback kind. Reads all config from
// `spec`; file links resolve through the injected `services.fileUrlForIndex`.
export function Text({ spec = {}, data, services }) {
  const format = spec.format ?? 'default';
  const style = spec.style ?? 'default';
  const hideIfEmpty = spec.hideIfEmpty;

  if (hideIfEmpty && (data == null || data === '')) return null;

  if (format === 'file-links') {
    if (!Array.isArray(data) || data.length === 0) {
      return <div className="board-text-muted small">No files uploaded</div>;
    }
    return (
      <div>
        {data.map((file, index) => {
          if (!file?.stored_name) return null;
          const name = file.name ?? file.stored_name;
          const size = file.size ? ` (${Math.round(file.size / 1024)}KB)` : '';
          const href = services?.fileUrlForIndex?.(index, file);
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
  return <Tag className={`${className} board-card-copy-block`}>{data != null ? String(data) : ''}</Tag>;
}

export const entry = {
  kind: 'text',
  renderComponentFn: Text,
  meta: { showLabel: true, isReadonly: true },
};
