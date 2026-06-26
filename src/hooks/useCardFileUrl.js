import { useEffect, useState } from 'react';
import { ensureCardFileUrl, getCardFileUrl } from '../lib/client.js';

// Synchronously resolve a card file's download URL, or '' when not yet known /
// not applicable.
function resolveCardFileUrl(boardId, cardId, index, file) {
  if (!boardId || !cardId || !file || !Number.isInteger(index) || index < 0) {
    return '';
  }
  const storedName = typeof file.stored_name === 'string' ? file.stored_name : '';
  if (!storedName) {
    return '';
  }
  return getCardFileUrl(boardId, cardId, index, storedName) || '';
}

/**
 * Resolve the download URL for a card attachment. Returns the URL synchronously
 * when it is already known, otherwise falls back to the async
 * `ensureCardFileUrl` resolver and updates once it lands. Returns '' while the
 * URL is unknown or the inputs are invalid.
 *
 * Shared by every attachment chip (chat system messages, the postbox file view)
 * so the get/ensure resolution dance lives in one place.
 */
export function useCardFileUrl(boardId, cardId, index, file) {
  const [href, setHref] = useState(() => resolveCardFileUrl(boardId, cardId, index, file));

  useEffect(() => {
    const immediate = resolveCardFileUrl(boardId, cardId, index, file);
    if (immediate) {
      setHref(immediate);
      return undefined;
    }

    const storedName = typeof file?.stored_name === 'string' ? file.stored_name : '';
    if (!storedName || !Number.isInteger(index) || index < 0) {
      setHref('');
      return undefined;
    }

    let cancelled = false;
    void ensureCardFileUrl(boardId, cardId, index, storedName)
      .then((resolved) => {
        if (!cancelled) setHref(resolved || '');
      })
      .catch(() => {
        if (!cancelled) setHref('');
      });

    return () => {
      cancelled = true;
    };
  }, [boardId, cardId, index, file]);

  return href;
}

export default useCardFileUrl;
