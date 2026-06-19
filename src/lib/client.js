/**
 * boardApi.js — thin fetch wrappers for the board-server HTTP API.
 * The server has Access-Control-Allow-Origin: * so direct connections work.
 */
export { SERVER } from './appConfig.js';
import { SERVER } from './appConfig.js';

const normalizeOrigin = (serverOrigin = SERVER) => (typeof serverOrigin === 'string'
  ? serverOrigin.trim().replace(/\/+$/, '')
  : '');

const base = (boardId) => `${SERVER}/api/boards/${boardId}`;

const createHttpBoardTransport = () => {
  const postJson = (url, body) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const postControlplane = (boardId, tool, args = {}) => postJson(
    `${base(boardId)}/mcp-controlplane`,
    { tool, args: { board_id: boardId, ...args } },
  );

  const postAction = (boardId, tool, args = {}) => postJson(
    `${base(boardId)}/mcp-actions`,
    { tool, args },
  );

  return {
    healthz: () => fetch(`${SERVER}/healthz`),
    initBoard: (boardId) => fetch(`${base(boardId)}/sse?one-shot`),
    refreshCard: (boardId, cardId) => postAction(boardId, 'retrigger-card', {
      card_id: cardId,
    }),
    resetRuntimeFromSeedCards: (boardId) => fetch(`${base(boardId)}/reset-runtime-from-seed-cards`, {
      method: 'POST',
    }),
    reverseSaveRuntimeToSeedCards: (boardId) => fetch(`${base(boardId)}/reverse-save-runtime-to-seed-cards`, {
      method: 'POST',
    }),
    dispatchAction: (boardId, cardId, type, payload = {}) => postAction(boardId, type, {
      card_id: cardId,
      payload,
    }),
    callBoardMcp: (boardId, tool, args = {}) => postJson(`${base(boardId)}/mcp`, { tool, args }),
    callBoardWebhooksMcp: (boardId, tool, args = {}) => postJson(`${base(boardId)}/mcp-webhooks`, { tool, args }),
    callBoardControlplaneMcp: (boardId, tool, args = {}) => postControlplane(boardId, tool, args),
    openBoardSse: (boardId, clientId) => new EventSource(
      `${base(boardId)}/sse?clientId=${encodeURIComponent(clientId)}`,
    ),
    getCardFileUrl: (boardId, cardId, index, storedName = '') => {
      const query = typeof storedName === 'string' && storedName.trim()
        ? `?sn=${encodeURIComponent(storedName)}`
        : '';
      return `${base(boardId)}/cards/${cardId}/files/${index}${query}`;
    },
    subscribeCardChats: (boardId, cardId, clientId) => postControlplane(boardId, 'sse.subscribe-chat', {
      client_id: clientId,
      card_id: cardId,
    }),
    unsubscribeCardChats: (boardId, cardId, clientId) => postControlplane(boardId, 'sse.unsubscribe-chat', {
      client_id: clientId,
      card_id: cardId,
    }),
    subscribeWatchparty: (boardId, cardId, channelName, clientId) => postControlplane(boardId, 'sse.watch-channel', {
      client_id: clientId,
      channel_name: channelName,
      ...(cardId ? { card_id: cardId } : {}),
    }),
    unsubscribeWatchparty: (boardId, cardId, channelName, clientId) => postControlplane(boardId, 'sse.unwatch-channel', {
      client_id: clientId,
      channel_name: channelName,
      ...(cardId ? { card_id: cardId } : {}),
    }),
  };
};

const boardTransport = createHttpBoardTransport();

async function postControlfaceMcpExtras(serverOrigin, tool, args = {}) {
  const normalizedOrigin = normalizeOrigin(serverOrigin);
  if (!normalizedOrigin) {
    throw new Error('Server origin is required');
  }
  const response = await fetch(`${normalizedOrigin}/mcp-extras`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, args }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof payload?.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : `mcp-extras ${tool} failed with status ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

const bytesToBase64 = (bytes) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const toAttachmentArg = async (file) => ({
  file_name: file?.name || 'upload.bin',
  content_type: file?.type || 'application/octet-stream',
  base64: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
});

const requireTurnId = (turnId, helperName) => {
  const normalizedTurnId = typeof turnId === 'string' ? turnId.trim() : '';
  if (!normalizedTurnId) {
    throw new Error(`${helperName} requires a non-empty turnId`);
  }
  return normalizedTurnId;
};

const ensureOkResponse = async (response, operation) => {
  if (response?.ok) return response;
  let detail = '';
  try {
    detail = await response.text();
  } catch {
    detail = '';
  }
  const suffix = detail ? `: ${detail}` : '';
  throw new Error(`${operation} failed with status ${response?.status ?? 'unknown'}${suffix}`);
};

const parseOneShotSsePayload = (rawText) => {
  const dataLine = String(rawText || '')
    .split(/\r?\n/)
    .find((line) => line.startsWith('data: '));
  if (!dataLine) {
    throw new Error('sse one-shot bootstrap missing data frame');
  }
  return JSON.parse(dataLine.slice(6));
};

export const healthz = () =>
  boardTransport.healthz();

export const fetchBoardOneShotPayload = async (boardId) => {
  const response = await boardTransport.initBoard(boardId);
  await ensureOkResponse(response, 'sse one-shot bootstrap');
  return parseOneShotSsePayload(await response.text());
};

export const initBoard = (boardId) =>
  fetchBoardOneShotPayload(boardId);

export const refreshCard = (boardId, cardId) =>
  boardTransport.refreshCard(boardId, cardId);

export const resetRuntimeFromSeedCards = (boardId) =>
  boardTransport.resetRuntimeFromSeedCards(boardId);

export const reverseSaveRuntimeToSeedCards = (boardId) =>
  boardTransport.reverseSaveRuntimeToSeedCards(boardId);

export async function listRuntimeCards(boardId) {
  const response = await callBoardControlplaneMcp(boardId, 'list-runtime-cards');
  if (!response.ok) {
    throw new Error(`list-runtime-cards failed with status ${response.status}`);
  }
  const payload = await response.json();
  const cards = Array.isArray(payload?.data) ? payload.data : payload?.data?.cards;
  return Array.isArray(cards) ? cards : [];
}

export async function upsertRuntimeCard(boardId, candidateCardContent) {
  const cardId = typeof candidateCardContent?.id === 'string' ? candidateCardContent.id.trim() : '';
  if (!cardId) throw new Error('upsertRuntimeCard requires candidateCardContent.id');
  const response = await callBoardControlplaneMcp(boardId, 'manage.upsert-card', {
    card_id: cardId,
    candidate_card_content: candidateCardContent,
  });
  if (!response.ok) {
    throw new Error(`manage.upsert-card failed with status ${response.status}`);
  }
  return response.json();
}

export async function removeRuntimeCard(boardId, cardId) {
  const normalizedCardId = typeof cardId === 'string' ? cardId.trim() : '';
  if (!normalizedCardId) throw new Error('removeRuntimeCard requires cardId');
  const response = await callBoardControlplaneMcp(boardId, 'manage.remove-card', {
    card_id: normalizedCardId,
  });
  if (!response.ok) {
    throw new Error(`manage.remove-card failed with status ${response.status}`);
  }
  return response.json();
}

export const patchCard = (boardId, cardId, patch) =>
  callBoardControlplaneMcp(boardId, 'manage.patch-card', {
    card_id: cardId,
    patch,
  });

export const dispatchAction = (boardId, cardId, type, payload = {}) =>
  boardTransport.dispatchAction(boardId, cardId, type, payload);

export const callBoardMcp = (boardId, tool, args = {}) =>
  boardTransport.callBoardMcp(boardId, tool, args);

export const callBoardWebhooksMcp = (boardId, tool, args = {}) =>
  boardTransport.callBoardWebhooksMcp(boardId, tool, args);

export const callBoardControlplaneMcp = (boardId, tool, args = {}) =>
  boardTransport.callBoardControlplaneMcp(boardId, tool, args);

export const openBoardSse = (boardId, clientId) =>
  boardTransport.openBoardSse(boardId, clientId);

export const getCardFileUrl = (boardId, cardId, index, storedName = '') =>
  boardTransport.getCardFileUrl(boardId, cardId, index, storedName);

export const ensureCardFileUrl = (boardId, cardId, index, storedName = '') => {
  if (typeof boardTransport.ensureCardFileUrl === 'function') {
    return boardTransport.ensureCardFileUrl(boardId, cardId, index, storedName);
  }
  return Promise.resolve(boardTransport.getCardFileUrl(boardId, cardId, index, storedName));
};

export const addChatAttachment = async (boardId, cardId, file, turnId) =>
  callBoardControlplaneMcp(boardId, 'manage.add-chat-attachment', {
    card_id: cardId,
    turn_id: requireTurnId(turnId, 'addChatAttachment'),
    ...(await toAttachmentArg(file)),
  });

export const uploadFileForChat = (boardId, cardId, file, turnId) =>
  addChatAttachment(boardId, cardId, file, turnId);

export const addChatEntryAndAnyAttachments = async (
  boardId,
  cardId,
  { role = 'user', text = '', turnId, files = [] } = {},
) => {
  const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  const attachmentArgs = normalizedFiles.length > 0
    ? await Promise.all(normalizedFiles.map((file) => toAttachmentArg(file)))
    : [];
  const normalizedTurnId = requireTurnId(turnId, 'addChatEntryAndAnyAttachments');

  return callBoardControlplaneMcp(boardId, 'manage.add-chat-entry-and-any-attachments', {
    card_id: cardId,
    role,
    text: typeof text === 'string' ? text : String(text ?? ''),
    turn_id: normalizedTurnId,
    ...(attachmentArgs.length > 0 ? { files: attachmentArgs } : {}),
  });
};

export const subscribeCardChats = (boardId, cardId, clientId) =>
  boardTransport.subscribeCardChats(boardId, cardId, clientId);

export const unsubscribeCardChats = (boardId, cardId, clientId) =>
  boardTransport.unsubscribeCardChats(boardId, cardId, clientId);

export const subscribeWatchparty = (boardId, cardId, channelName, clientId) =>
  boardTransport.subscribeWatchparty(boardId, cardId, channelName, clientId);

export const unsubscribeWatchparty = (boardId, cardId, channelName, clientId) =>
  boardTransport.unsubscribeWatchparty(boardId, cardId, channelName, clientId);

function normalizeSampleTemplateEntries(payload) {
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  return entries
    .map((entry) => {
      const key = typeof entry?.key === 'string' ? entry.key.trim() : '';
      const label = typeof entry?.label === 'string' ? entry.label.trim() : '';
      if (!key || !label) return null;
      return {
        key,
        label,
        description: typeof entry?.description === 'string' ? entry.description.trim() : '',
      };
    })
    .filter(Boolean);
}

export async function listSampleTemplates(serverOrigin = SERVER) {
  const payload = await postControlfaceMcpExtras(serverOrigin, 'explore.list-sample-templates');
  return normalizeSampleTemplateEntries(payload);
}

export async function getSampleTemplate(serverOrigin = SERVER, key) {
  const normalizedKey = typeof key === 'string' ? key.trim() : '';
  if (!normalizedKey) {
    throw new Error('Template key is required');
  }
  const payload = await postControlfaceMcpExtras(serverOrigin, 'explore.get-sample-template', {
    key: normalizedKey,
  });
  return {
    key: typeof payload?.key === 'string' ? payload.key.trim() : normalizedKey,
    label: typeof payload?.label === 'string' ? payload.label.trim() : normalizedKey,
    description: typeof payload?.description === 'string' ? payload.description.trim() : '',
    payload: payload?.payload ?? null,
  };
}
