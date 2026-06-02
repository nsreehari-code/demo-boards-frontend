import {
  addChatEntryAndAnyAttachments,
  callBoardControlplaneMcp,
  callBoardMcp,
  callBoardWebhooksMcp,
  dispatchAction,
  ensureCardFileUrl,
  getCardFileUrl,
  initBoard,
  openBoardSse,
  subscribeCardChats,
  unsubscribeCardChats,
  uploadFileForChat,
} from '../../src/lib/client.js';
import { applyBoardSseFrame, createEmptyBoardSnapshot, EMPTY_ARRAY } from '../../src/lib/board-sse-state.js';

function createClientId(prefix = 'board-smoke') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function readResponseBody(response) {
  const contentType = String(response?.headers?.get?.('content-type') || '');
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

async function expectOkResponse(response, label) {
  if (response?.ok) {
    return readResponseBody(response);
  }

  let detail = '';
  try {
    const body = await readResponseBody(response);
    detail = typeof body === 'string' ? body : JSON.stringify(body);
  } catch {
    detail = '';
  }
  const suffix = detail ? `: ${detail}` : '';
  throw new Error(`${label} failed with status ${response?.status ?? 'unknown'}${suffix}`);
}

function defaultCompletionPredicate(summary) {
  if (!summary || typeof summary !== 'object') return false;
  const cardCount = Number(summary.card_count ?? 0);
  const completed = Number(summary.completed ?? 0);
  if (cardCount <= 0) return false;
  if (completed !== cardCount) return false;
  if (Number(summary.pending ?? 0) !== 0) return false;
  if (Number(summary.in_progress ?? 0) !== 0) return false;
  if (Number(summary.blocked ?? 0) !== 0) return false;
  if (Number(summary.unresolved ?? 0) !== 0) return false;
  return summary;
}

export function createBoardTestHarness({ boardId, clientId = createClientId() } = {}) {
  const normalizedBoardId = typeof boardId === 'string' ? boardId.trim() : '';
  if (!normalizedBoardId) {
    throw new Error('createBoardTestHarness requires a non-empty boardId');
  }

  let snapshot = createEmptyBoardSnapshot(normalizedBoardId);
  let initialPayload = null;
  let es = null;
  let started = false;
  let disposed = false;

  const frames = [];
  const chatEvents = [];
  const boardEvents = [];

  const getChatEvents = (cardId = '') => {
    const normalizedCardId = typeof cardId === 'string' ? cardId.trim() : '';
    if (!normalizedCardId) return [...chatEvents];
    return chatEvents.filter((event) => event.cardId === normalizedCardId);
  };

  const getBoardEvents = () => [...boardEvents];

  const applyPayload = (payload) => {
    frames.push(payload);
    if (!initialPayload && Array.isArray(payload?.cardDefinitions) && payload.cardDefinitions.length > 0) {
      initialPayload = payload;
    }
    if (payload?.kind === 'notification-batch' && Array.isArray(payload.notifications)) {
      for (const notification of payload.notifications) {
        if (notification?.kind === 'card_chats' && notification.cardId) {
          chatEvents.push({
            at: Date.now(),
            cardId: notification.cardId,
            processing: !!notification.processing,
            receiving: !!notification.receiving,
            messageCount: Array.isArray(notification.messages) ? notification.messages.length : 0,
            messages: Array.isArray(notification.messages) ? notification.messages : EMPTY_ARRAY,
          });
        }
        if ((notification?.kind === 'card_removed' || notification?.kind === 'card_refreshed') && notification.cardId) {
          boardEvents.push({
            at: Date.now(),
            kind: notification.kind,
            cardId: notification.cardId,
            card: notification.card ?? null,
          });
        }
      }
    }
    snapshot = applyBoardSseFrame(snapshot, payload);
    return snapshot;
  };

  const waitUntil = async (predicate, timeoutMs = 30_000, label = 'condition') => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const result = await predicate();
      if (result !== undefined && result !== null && result !== false) {
        return result;
      }
      await delay(100);
    }
    throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
  };

  return {
    clientId,
    getSnapshot: () => snapshot,
    getFrames: () => [...frames],
    getInitialPayload: () => initialPayload,
    getStatusSummary: () => snapshot?.boardStatus?.summary ?? null,
    getCardDefinition: (cardId) => snapshot?.cardDefinitionsAndData?.[cardId]?.cardContent ?? null,
    getCardData: (cardId) => snapshot?.cardDefinitionsAndData?.[cardId]?.cardData ?? null,
    getCardRuntime: (cardId) => snapshot?.boardStatus?.cardRuntimesById?.[cardId] ?? null,
    getComputedValues: (cardId) => snapshot?.boardCardComputedValues?.[cardId] ?? null,
    getChatState: (cardId) => snapshot?.cardChatViews?.[cardId]?.chatState ?? null,
    getChatEvents,
    getBoardEvents,
    async start({ runInit = true } = {}) {
      if (disposed) {
        throw new Error('Cannot start a disposed board test harness');
      }
      if (started) return clientId;
      if (runInit) {
        await initBoard(normalizedBoardId);
      }
      es = openBoardSse(normalizedBoardId, clientId);
      es.onmessage = (event) => {
        try {
          applyPayload(JSON.parse(event.data));
        } catch {
          // ignore malformed frames
        }
      };
      es.onerror = () => {
        // EventSource reconnects automatically.
      };
      started = true;
      return clientId;
    },
    dispose() {
      disposed = true;
      if (es) {
        es.close();
        es = null;
      }
    },
    waitUntil,
    waitForInitialPayload(timeoutMs = 15_000) {
      return waitUntil(() => initialPayload, timeoutMs, 'initial SSE payload');
    },
    waitForAllCompleted(timeoutMs = 30_000, label = 'all cards completed') {
      return waitUntil(() => defaultCompletionPredicate(snapshot?.boardStatus?.summary), timeoutMs, label);
    },
    waitForStatus(predicate, timeoutMs = 30_000, label = 'status predicate') {
      return waitUntil(() => predicate(snapshot?.boardStatus?.summary ?? null, snapshot), timeoutMs, label);
    },
    waitForChatPredicate(cardId, predicate, timeoutMs = 45_000, label = 'chat predicate') {
      return waitUntil(() => {
        const chatState = snapshot?.cardChatViews?.[cardId]?.chatState ?? null;
        const events = getChatEvents(cardId);
        return predicate({
          cardId,
          chatState,
          events,
          messages: Array.isArray(chatState?.messages) ? chatState.messages : EMPTY_ARRAY,
          snapshot,
        });
      }, timeoutMs, label);
    },
    waitForBoardEvent(predicate, timeoutMs = 15_000, label = 'board event') {
      return waitUntil(() => predicate(getBoardEvents(), snapshot), timeoutMs, label);
    },
    async callMcp(tool, args = {}) {
      return expectOkResponse(await callBoardMcp(normalizedBoardId, tool, args), tool);
    },
    async callWebhooksMcp(tool, args = {}) {
      return expectOkResponse(await callBoardWebhooksMcp(normalizedBoardId, tool, args), tool);
    },
    async callControlplane(tool, args = {}) {
      return expectOkResponse(await callBoardControlplaneMcp(normalizedBoardId, tool, args), tool);
    },
    async dispatchCardAction(cardId, actionType, payload = {}) {
      return expectOkResponse(
        await dispatchAction(normalizedBoardId, cardId, actionType, payload),
        `${cardId}:${actionType}`,
      );
    },
    async subscribeCardChats(cardId) {
      return expectOkResponse(
        await subscribeCardChats(normalizedBoardId, cardId, clientId),
        `subscribe chat ${cardId}`,
      );
    },
    async unsubscribeCardChats(cardId) {
      return expectOkResponse(
        await unsubscribeCardChats(normalizedBoardId, cardId, clientId),
        `unsubscribe chat ${cardId}`,
      );
    },
    async uploadChatFile(cardId, file, turnId = '') {
      return expectOkResponse(
        await uploadFileForChat(normalizedBoardId, cardId, file, turnId),
        `upload chat file ${cardId}`,
      );
    },
    async sendChatEntry(cardId, { role = 'user', text = '', turnId, files = [] } = {}) {
      return expectOkResponse(
        await addChatEntryAndAnyAttachments(normalizedBoardId, cardId, {
          role,
          text,
          turnId,
          files,
        }),
        `add chat entry ${cardId}`,
      );
    },
    async sendChatAction(cardId, { text = '', turnId = '', files = [] } = {}) {
      return this.dispatchCardAction(cardId, 'chat-send', {
        text,
        ...(turnId ? { 'turn-id': turnId } : null),
        ...(Array.isArray(files) && files.length > 0 ? { files } : null),
      });
    },
    async uploadTextCardFileViaControlplane(cardId, {
      fileName = 'upload.txt',
      text = '',
      contentType = 'text/plain; charset=utf-8',
    } = {}) {
      return this.callControlplane('manage.upload-card-file', {
        card_id: cardId,
        file_name: fileName,
        content_type: contentType,
        text,
      });
    },
    getCardFileUrl(cardId, index, storedName = '') {
      return getCardFileUrl(normalizedBoardId, cardId, index, storedName);
    },
    ensureCardFileUrl(cardId, index, storedName = '') {
      return ensureCardFileUrl(normalizedBoardId, cardId, index, storedName);
    },
    async downloadCardFileText(cardId, index, storedName = '') {
      const url = await ensureCardFileUrl(normalizedBoardId, cardId, index, storedName);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`download ${cardId}#${index} failed with status ${response.status}`);
      }
      return response.text();
    },
  };
}