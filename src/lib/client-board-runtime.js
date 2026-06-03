/**
 * client-board-runtime.js
 *
 * Backend-AGNOSTIC in-browser board runtime/transport.
 *
 * This file owns ONLY:
 *   - session lifecycle and per-board singleton management
 *   - synthetic Node-style req/res for hitting the server-runtime API surface
 *   - the local EventSource-like fan-out for SSE/notification batches
 *   - in-memory chat storage
 *   - card-file URL materialization caching
 *
 * It does NOT import any backend SDK (firebase, cosmos, signalr, ...). All
 * storage/adapter wiring is delegated to a `createStorageAdapter(boardId,
 * storageConfig, runtimeHooks)` factory passed in by the caller. The factory
 * must return `{ refs, boardAdapter }` matching the yaml-flow async board
 * platform adapter shape.
 */

const encoder = new TextEncoder();
const IN_PROCESS_REF_PREFIX = 'b64:';

function toBase64Url(value) {
  const bytes = encoder.encode(value);
  let base64 = '';

  if (globalThis.Buffer) {
    base64 = globalThis.Buffer.from(bytes).toString('base64');
  } else {
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    base64 = btoa(binary);
  }

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);

  if (globalThis.Buffer) {
    return globalThis.Buffer.from(padded, 'base64').toString('utf8');
  }

  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

function serializeExecutionTarget(kind, value) {
  return `${IN_PROCESS_REF_PREFIX}${toBase64Url(JSON.stringify({ kind, value }))}`;
}

function resolveExecutionTargetValue(target) {
  if (typeof target !== 'string') return '';
  const trimmed = target.trim();
  if (!trimmed.startsWith(IN_PROCESS_REF_PREFIX)) {
    return trimmed;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(trimmed.slice(IN_PROCESS_REF_PREFIX.length)));
    return typeof parsed?.value === 'string' ? parsed.value.trim() : '';
  } catch {
    return '';
  }
}

function okJson(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function getRuntimeApis() {
  const runtimeApi = globalThis.ServerRuntimeControlface;
  if (!runtimeApi?.createSingleBoardServerRuntime) {
    throw new Error('yaml-flow browser runtime bundle did not expose ServerRuntimeControlface.createSingleBoardServerRuntime');
  }
  return runtimeApi;
}

function createInMemoryChatStorage() {
  const journals = new Map();
  const configByCardId = new Map();
  const processingByCardId = new Map();

  function journal(cardId) {
    if (!journals.has(cardId)) journals.set(cardId, []);
    return journals.get(cardId);
  }

  return {
    append(cardId, role, text, files = [], turn = '') {
      const entry = {
        id: globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role, text, files, turn,
        updated_at: new Date().toISOString(),
      };
      journal(cardId).push(entry);
      return entry.id;
    },
    readAll(cardId) { return [...journal(cardId)]; },
    readAfter(cardId, cursor) {
      const entries = journal(cardId);
      if (!cursor) {
        return {
          entries: [...entries],
          newCursor: entries.length > 0 ? entries[entries.length - 1].id : null,
        };
      }
      const index = entries.findIndex((entry) => entry.id === cursor);
      const nextEntries = index === -1 ? [...entries] : entries.slice(index + 1);
      return {
        entries: nextEntries,
        newCursor: nextEntries.length > 0 ? nextEntries[nextEntries.length - 1].id : cursor,
      };
    },
    clear(cardId) {
      journals.delete(cardId);
      processingByCardId.delete(cardId);
      configByCardId.delete(cardId);
    },
    setProcessing(cardId, active) { processingByCardId.set(cardId, Boolean(active)); },
    isProcessing(cardId) { return processingByCardId.get(cardId) === true; },
    getConfig(cardId) { return configByCardId.get(cardId) ?? {}; },
    setConfig(cardId, patch) {
      configByCardId.set(cardId, {
        ...(configByCardId.get(cardId) ?? {}),
        ...(patch && typeof patch === 'object' ? patch : {}),
      });
    },
  };
}

function normalizeHeaders(headers) {
  const normalized = new Headers();
  if (!headers || typeof headers !== 'object') return normalized;
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    normalized.set(key, String(value));
  }
  return normalized;
}

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'string') return encoder.encode(value);
  return new Uint8Array(0);
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function makeSyntheticRequest(method, path, body, headers = {}) {
  const bodyBytes = body == null
    ? new Uint8Array(0)
    : body instanceof Uint8Array
      ? body
      : encoder.encode(typeof body === 'string' ? body : JSON.stringify(body));
  let consumed = false;
  return {
    method, url: path, headers,
    on() {},
    [Symbol.asyncIterator]() {
      const iterator = {
        async next() {
          if (consumed) return { done: true, value: undefined };
          consumed = true;
          return { done: false, value: bodyBytes };
        },
        [Symbol.asyncIterator]() { return iterator; },
      };
      return iterator;
    },
  };
}

function makeSyntheticResponse() {
  let status = 200;
  let headers = new Headers();
  const chunks = [];
  return {
    res: {
      writeHead(nextStatus, nextHeaders = {}) {
        status = nextStatus;
        headers = normalizeHeaders(nextHeaders);
      },
      write(data) { chunks.push(toBytes(data)); return true; },
      end(data) { if (data) chunks.push(toBytes(data)); },
    },
    toResponse() { return new Response(concatBytes(chunks), { status, headers }); },
  };
}

function createInProcessCallbackTransport(handlerKey) {
  return {
    createCallback(token) {
      return {
        token,
        via: {
          meta: 'board-live-cards',
          howToRun: 'in-process-loop',
          whatToRun: serializeExecutionTarget('in-process-loop', handlerKey),
        },
      };
    },
  };
}

function createInvocationAdapter(inProcessHandlers = new Map()) {
  return {
    async invoke(ref, args) {
      if (ref?.howToRun === 'in-process-loop') {
        const handlerKey = resolveExecutionTargetValue(ref.whatToRun);
        const handler = handlerKey ? inProcessHandlers.get(handlerKey) : null;
        if (!handler) {
          return {
            dispatched: false,
            error: `Unsupported in-browser execution transport: ${String(ref?.howToRun || 'unknown')}`,
          };
        }
        return handler(args);
      }

      if (ref?.howToRun === 'http:post') {
        const response = await fetch(String(ref.whatToRun || ''), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...args, ...(ref.extra ? { extra: ref.extra } : {}) }),
        });
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          return { dispatched: false, error: `HTTP ${response.status}${text ? `: ${text}` : ''}` };
        }
        return { dispatched: true };
      }
      return {
        dispatched: false,
        error: `Unsupported in-browser execution transport: ${String(ref?.howToRun || 'unknown')}`,
      };
    },
  };
}

function resolveSeedCardsUrl(template, boardId) {
  const trimmed = typeof template === 'string' ? template.trim() : '';
  if (!trimmed) return '';
  return trimmed.replace(/\{boardId\}/g, encodeURIComponent(boardId));
}

function apiBasePathForBoard(boardId) {
  return `/api/boards/${encodeURIComponent(boardId)}`;
}

async function loadSeedCards(template, boardId) {
  const url = resolveSeedCardsUrl(template, boardId);
  if (!url) return [];
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load seed cards for ${boardId}: ${response.status}`);
  }
  const payload = await response.json();
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.cards)) return payload.cards;
  throw new Error(`Seed cards payload for ${boardId} must be an array or { cards: [...] }`);
}

function makeEventSource(session, clientId) {
  const existing = session.clients.get(clientId);
  if (existing?.source?.close) existing.source.close();

  const source = {
    readyState: 1,
    onmessage: null,
    onerror: null,
    close() {
      if (source.readyState === 2) return;
      source.readyState = 2;
      session.clients.delete(clientId);
    },
  };

  session.clients.set(clientId, { source, subscribedChatCardIds: new Set() });

  queueMicrotask(async () => {
    if (source.readyState === 2) return;
    try {
      await session.ensureInitialized();
      const payload = await session.runtime.buildPublishedRuntimePayload();
      session.emitToClient(clientId, payload);
    } catch (error) {
      try { source.onerror?.(error); } catch { /* ignore */ }
    }
  });

  return source;
}

/**
 * Factory: build an in-browser board transport bound to a particular
 * storage backend.
 *
 * @param {object} params
 * @param {(boardId, storageConfig, runtimeHooks) => ({ refs, boardAdapter }|Promise<{ refs, boardAdapter }>)} params.createStorageAdapter
 * @param {object} [params.storageConfig]   Backend-specific config slice.
 * @param {string} [params.seedCardsUrl]    Optional seed cards URL template.
 * @param {string} [params.transportName]   Label used in healthz/skipped responses.
 */
export function createInBrowserBoardTransport({
  createStorageAdapter,
  storageConfig = {},
  seedCardsUrl = '',
  transportName = 'inbrowser',
} = {}) {
  if (typeof createStorageAdapter !== 'function') {
    throw new Error('createInBrowserBoardTransport requires a createStorageAdapter factory');
  }

  const { createSingleBoardServerRuntime } = getRuntimeApis();
  const runtimeSessions = new Map();

  function createSession(boardId) {
    const chatStorage = createInMemoryChatStorage();
    const inProcessHandlers = new Map();
    const callbackHandlerKey = `board:${boardId}:board-worker-callback`;
    const session = {
      boardId,
      clients: new Map(),
      fileUrlCache: new Map(),
      initializedPromise: null,
      processPromise: null,
      emitToClient(clientId, payload) {
        const client = session.clients.get(clientId);
        if (!client || client.source.readyState === 2) return;
        try { client.source.onmessage?.({ data: JSON.stringify(payload) }); } catch { /* ignore */ }
      },
      emitNotificationBatch(notifications, predicate = null) {
        if (!Array.isArray(notifications) || notifications.length === 0) return;
        const payload = { kind: 'notification-batch', notifications };
        for (const [clientId] of session.clients.entries()) {
          if (typeof predicate === 'function' && !predicate(clientId)) continue;
          session.emitToClient(clientId, payload);
        }
      },
      makeCardChatsNotification(cardId, receiving = false) {
        const messages = chatStorage.readAll(cardId).map((entry) => ({
          role: String(entry.role || 'system'),
          text: String(entry.text || ''),
          files: Array.isArray(entry.files) ? entry.files : [],
        }));
        const sentAtMs = Date.now();
        return {
          kind: 'card_chats',
          cardId,
          sentAt: new Date(sentAtMs).toISOString(),
          sentAtMs,
          messages,
          receiving,
          processing: chatStorage.isProcessing(cardId),
        };
      },
      flushSubscribedChatNotifications(receiving = false) {
        for (const [clientId, client] of session.clients.entries()) {
          const notifications = [...client.subscribedChatCardIds].map((cardId) =>
            session.makeCardChatsNotification(cardId, receiving));
          if (notifications.length > 0) {
            session.emitNotificationBatch(notifications, (candidateId) => candidateId === clientId);
          }
        }
      },
      async processAccumulated() {
        if (!session.processPromise) {
          session.processPromise = Promise.resolve(session.runtime.processAccumulatedEvents())
            .finally(() => {
              session.processPromise = null;
              session.flushSubscribedChatNotifications(false);
            });
        }
        return session.processPromise;
      },
      async runtimeFetch(method, path, body = undefined, headers = {}) {
        await session.ensureInitialized();
        return session.runtimeFetchDirect(method, path, body, headers);
      },
      async runtimeFetchDirect(method, path, body = undefined, headers = {}) {
        const request = makeSyntheticRequest(method, path, body, headers);
        const synth = makeSyntheticResponse();
        const handled = await session.runtime.handleRuntimeApi(request, synth.res, new URL(`http://localhost${path}`));
        if (!handled) {
          return new Response(JSON.stringify({ error: `No runtime route matched: ${path}` }), {
            status: 404, headers: { 'Content-Type': 'application/json' },
          });
        }
        const response = synth.toResponse();
        if (response.ok && method !== 'GET') {
          queueMicrotask(() => session.flushSubscribedChatNotifications(false));
        }
        return response;
      },
      async ensureInitialized() {
        if (!session.initializedPromise) {
          session.initializedPromise = (async () => {
            await session.runtimeReadyPromise;
            const existingCards = await session.runtime.cardStore.get({});
            const cards = Array.isArray(existingCards?.data?.cards) ? existingCards.data.cards : [];
            if (cards.length === 0) {
              const seedCards = await loadSeedCards(seedCardsUrl, boardId);
              if (seedCards.length > 0) {
                await session.runtime.cardStore.set({ body: seedCards });
              }
            }
            await session.runtimeFetchDirect('GET', `${apiBasePathForBoard(boardId)}/sse?one-shot`);
          })();
        }
        return session.initializedPromise;
      },
      getCachedCardFileUrl(cardId, index, storedName = '') {
        return session.fileUrlCache.get(`${cardId}:${index}:${storedName}`) ?? '';
      },
      async ensureCardFileUrl(cardId, index, storedName = '') {
        const cacheKey = `${cardId}:${index}:${storedName}`;
        const cached = session.fileUrlCache.get(cacheKey);
        if (cached) return cached;
        const query = storedName ? `?sn=${encodeURIComponent(storedName)}` : '';
        const response = await session.runtimeFetch('GET',
          `${apiBasePathForBoard(boardId)}/cards/${encodeURIComponent(cardId)}/files/${index}${query}`);
        if (!response.ok) return '';
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        session.fileUrlCache.set(cacheKey, url);
        return url;
      },
    };

    session.runtimeReadyPromise = (async () => {
      inProcessHandlers.set(callbackHandlerKey, async (payload = {}) => {
        const token = typeof payload?.token === 'string' ? payload.token.trim() : '';
        const outcome = payload?.outcome === 'failure' ? 'failure' : 'success';
        if (!token) {
          return { dispatched: false, error: 'in-process callback payload requires a token' };
        }

        const response = await session.runtimeFetchDirect(
          'POST',
          `${apiBasePathForBoard(boardId)}/mcp-webhooks`,
          outcome === 'success'
            ? {
                tool: 'webhook.source-fetch-done',
                args: {
                  token,
                  ref: typeof payload?.ref === 'string' ? payload.ref : '',
                },
              }
            : {
                tool: 'webhook.source-fetch-failed',
                args: {
                  token,
                  reason: typeof payload?.reason === 'string' ? payload.reason : '',
                },
              },
        );

        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          return {
            dispatched: false,
            error: `In-process callback failed with status ${response.status}${detail ? `: ${detail}` : ''}`,
          };
        }

        return { dispatched: true };
      });

      const { refs, boardAdapter } = await createStorageAdapter(boardId, storageConfig, {
        requestProcessAccumulated: () => session.processAccumulated(),
        publishBoardChangeNotifications: (notifications) => session.emitNotificationBatch(notifications),
      });
      boardAdapter.callbackTransport = createInProcessCallbackTransport(callbackHandlerKey);

      session.runtime = createSingleBoardServerRuntime({
        boardId,
        apiBasePath: apiBasePathForBoard(boardId),
        boards: [{
          label: boardId,
          boardAdapter,
          baseRef: refs.baseRef,
          cardStoreRef: refs.cardStoreRef,
          outputsStoreRef: refs.outputsStoreRef,
          artifactsStoreRef: refs.artifactsStoreRef,
          scratchStoreRef: refs.scratchStoreRef,
          archiveStoreRef: refs.archiveStoreRef,
          chatStoreRef: refs.chatStoreRef,
        }],
        invocationAdapter: createInvocationAdapter(inProcessHandlers),
        logger: {
          info: (...args) => console.log('[client-board-runtime]', ...args),
          warn: (...args) => console.warn('[client-board-runtime]', ...args),
          error: (...args) => console.error('[client-board-runtime]', ...args),
        },
      });
    })();

    return session;
  }

  function getSession(boardId) {
    const normalizedBoardId = String(boardId || '').trim();
    if (!normalizedBoardId) throw new Error('Board id is required for in-browser transport');
    if (!runtimeSessions.has(normalizedBoardId)) {
      runtimeSessions.set(normalizedBoardId, createSession(normalizedBoardId));
    }
    return runtimeSessions.get(normalizedBoardId);
  }

  return {
    healthz: async () => okJson({ ok: true, transportMode: transportName }),
    initBoard: async (boardId) => {
      const session = getSession(boardId);
      await session.ensureInitialized();
      return okJson({ ok: true, transportMode: transportName, boardId });
    },
    refreshCard: (boardId, cardId) =>
      getSession(boardId).runtimeFetch('POST',
        `${apiBasePathForBoard(boardId)}/cards/${encodeURIComponent(cardId)}/retrigger`),
    resetRuntimeFromSeedCards: async () => okJson({ ok: true, skipped: true, transportMode: transportName }),
    reverseSaveRuntimeToSeedCards: async () => okJson({ ok: true, skipped: true, transportMode: transportName }),
    dispatchAction: (boardId, cardId, type, payload = {}) =>
      getSession(boardId).runtimeFetch('POST',
        `${apiBasePathForBoard(boardId)}/cards/${encodeURIComponent(cardId)}/actions`,
        { actionType: type, payload }),
    callBoardMcp: (boardId, tool, args = {}) =>
      getSession(boardId).runtimeFetch('POST',
        `${apiBasePathForBoard(boardId)}/mcp`, { tool, args }),
    callBoardWebhooksMcp: (boardId, tool, args = {}) =>
      getSession(boardId).runtimeFetch('POST',
        `${apiBasePathForBoard(boardId)}/mcp-webhooks`, { tool, args }),
    callBoardControlplaneMcp: (boardId, tool, args = {}) =>
      getSession(boardId).runtimeFetch('POST',
        `${apiBasePathForBoard(boardId)}/mcp-controlplane`,
        { tool, args: { board_id: boardId, ...args } }),
    openBoardSse: (boardId, clientId) => makeEventSource(getSession(boardId), clientId),
    getCardFileUrl: (boardId, cardId, index, storedName = '') =>
      getSession(boardId).getCachedCardFileUrl(cardId, index, storedName),
    ensureCardFileUrl: (boardId, cardId, index, storedName = '') =>
      getSession(boardId).ensureCardFileUrl(cardId, index, storedName),
    async subscribeCardChats(boardId, cardId, clientId) {
      const session = getSession(boardId);
      await session.ensureInitialized();
      const client = session.clients.get(clientId);
      if (client) {
        client.subscribedChatCardIds.add(cardId);
        session.emitNotificationBatch(
          [session.makeCardChatsNotification(cardId, true)],
          (candidateId) => candidateId === clientId,
        );
      }
      return okJson({ ok: true, boardId, cardId, clientId });
    },
    async unsubscribeCardChats(boardId, cardId, clientId) {
      const session = getSession(boardId);
      const client = session.clients.get(clientId);
      client?.subscribedChatCardIds.delete(cardId);
      return okJson({ ok: true, boardId, cardId, clientId });
    },
    subscribeWatchparty: async () => okJson({ ok: true, skipped: true, transportMode: transportName }),
    unsubscribeWatchparty: async () => okJson({ ok: true, skipped: true, transportMode: transportName }),
  };
}
