import { callBoardMcp } from './client.js';

// Merge a fresh SSE messages snapshot into the previously-accumulated live
// messages. The board's SSE chat view typically carries only the most recent
// turn, so we accumulate across snapshots instead of replacing: new messages
// are appended, and an existing message (same turn/role/occurrence) is updated
// in place to support streaming text. Returns the previous array unchanged when
// nothing changed to avoid needless re-renders.
export function mergeLiveMessages(prev, incoming) {
  if (!Array.isArray(incoming) || incoming.length === 0) return prev;

  const byKey = new Map();
  const order = [];
  for (const entry of prev) {
    byKey.set(entry.key, entry.msg);
    order.push(entry.key);
  }

  const counts = new Map();
  let changed = false;
  for (const msg of incoming) {
    const turn = typeof msg?.turn === 'string' ? msg.turn : '';
    const base = `${turn}|${msg?.role ?? ''}`;
    const occurrence = counts.get(base) ?? 0;
    counts.set(base, occurrence + 1);
    const key = `${base}|${occurrence}`;
    if (!byKey.has(key)) {
      order.push(key);
      changed = true;
    } else if (byKey.get(key) !== msg) {
      changed = true;
    }
    byKey.set(key, msg);
  }

  if (!changed) return prev;
  return order.map((key) => ({ key, msg: byKey.get(key) }));
}

export function mergeMessageArrays(existingMessages, incomingMessages) {
  const seeded = mergeLiveMessages([], existingMessages).map((entry) => ({ key: entry.key, msg: entry.msg }));
  return mergeLiveMessages(seeded, incomingMessages).map((entry) => entry.msg);
}

export function getMessageTurnId(msg) {
  return typeof msg?.turn === 'string' ? msg.turn.trim() : '';
}

export function getFirstTurnId(messages) {
  return (Array.isArray(messages) ? messages : [])
    .map((msg) => getMessageTurnId(msg))
    .find(Boolean) || '';
}

export function countDistinctTurns(messages) {
  return new Set(
    (Array.isArray(messages) ? messages : [])
      .map((msg) => getMessageTurnId(msg))
      .filter(Boolean),
  ).size;
}

export function makeTurnId() {
  return Math.random().toString(36).slice(2, 8).padEnd(6, '0');
}

// Fetch a backward page of chat messages strictly before `beforeTurnId`.
// Shared by the chat pane history surface and the postbox card.
export async function fetchChatMessagesBeforeTurn(boardId, cardId, beforeTurnId, turns) {
  const response = await callBoardMcp(boardId, 'inspect.chat-messages-on-cards', {
    card_id: cardId,
    tail_turns: turns,
    ...(beforeTurnId ? { tail_turns_before_id: beforeTurnId } : null),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof payload?.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : `inspect.chat-messages-on-cards failed with status ${response.status}`;
    throw new Error(message);
  }
  const data = payload && typeof payload === 'object' && payload.status === 'success' && 'data' in payload
    ? payload.data
    : payload;
  return Array.isArray(data?.messages) ? data.messages : [];
}
