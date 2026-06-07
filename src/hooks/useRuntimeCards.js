import { useMemo } from 'react';
import { listRuntimeCards, removeRuntimeCard, upsertRuntimeCard } from '../lib/client.js';

function unwrapPayload(payload, label) {
  if (payload && typeof payload === 'object' && payload.status === 'success') {
    return payload.data ?? null;
  }
  if (payload && typeof payload === 'object' && payload.status === 'fail') {
    const message = typeof payload.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : `${label} failed`;
    throw new Error(message);
  }
  return payload ?? null;
}

export function useRuntimeCards(boardId) {
  const runtimeCardActions = useMemo(() => ({
    listRuntimeCards: () => listRuntimeCards(boardId),
    upsertRuntimeCard: async (candidateCardContent) => unwrapPayload(
      await upsertRuntimeCard(boardId, candidateCardContent),
      'upsertRuntimeCard',
    ),
    removeRuntimeCard: async (cardId) => unwrapPayload(
      await removeRuntimeCard(boardId, cardId),
      'removeRuntimeCard',
    ),
  }), [boardId]);

  return { runtimeCardActions };
}