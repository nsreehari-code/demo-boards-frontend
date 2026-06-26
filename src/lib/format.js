// Human-readable file size formatting shared across the attachment surfaces
// (the message composer, the postbox file view, etc.).
export function formatFileSize(size) {
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
