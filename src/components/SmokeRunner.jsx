import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlobalModal } from './GlobalModal.jsx';
import { EMPTY_ARRAY, EMPTY_OBJECT } from '../lib/board-sse-state.js';
import { useBoardState } from '../hooks/useBoardState.js';
import { useCardState } from '../hooks/useCardState.js';
import { useChatActions } from '../hooks/useChatState.js';
import { useManageBoards } from '../hooks/useManageBoards.js';
import { useRuntimeCards } from '../hooks/useRuntimeCards.js';
import { useCardChatViews } from '../hooks/useSseSlices.js';
import { initBoard } from '../lib/client.js';

const SMOKE_BOARD_ID = 'live-test';
const PROBE_ENVELOPE = '__probe__echo__probe__';
const NON_PROBE_RESPONSE_TIMEOUT_MS = 120_000;

const PORTFOLIO_CARD_ID = 'card-portfolio-tc1-9008';
const MARKET_PRICES_CARD_ID = 'market-prices-tc2-9027';
const PORTFOLIO_VALUE_CARD_ID = 'portfolio-value-tc3-9043';
const T4_CHAT_CARD_ID = 'card-portfolio-t4-9104';
const T8_CHAT_CARD_ID = 'card-portfolio-t8-9108';
const T9_CHAT_CARD_ID = 'card-portfolio-t9-9109';
const T8F_CHAT_CARD_ID = 'card-portfolio-t8f-9118';
const T9F_CHAT_CARD_ID = 'card-portfolio-t9f-9119';
const TR_PORTFOLIO_CARD_ID = 'card-portfolio-tr-9200';
const TR_MARKET_PRICES_CARD_ID = 'market-prices-tr-9201';
const TR_QUOTES_TOKEN = 'quotes_tr2_9201';
const WARMUP_CHAT_CARD_ID = 'card-smoke-warmup-9099';
const AI_RESPONSE_CASE_ORDER = ['T3', 'T4', 'T8', 'T8F', 'T9', 'T9F'];
const AI_RESPONSE_EXPECTATIONS = {
  T3: {
    expectedLabel: 'Echo: hi testing',
    matches: (responseText) => String(responseText || '').includes('Echo: hi testing'),
  },
  T4: {
    expectedLabel: 'what is the capital of japan',
    matches: (responseText) => String(responseText || '').toLowerCase().includes('what is the capital of japan'),
  },
  T8: {
    expectedLabel: 'paris',
    matches: (responseText) => /paris/i.test(String(responseText || '').trim()),
  },
  T9: {
    expectedLabel: 'paris',
    matches: (responseText) => /paris/i.test(String(responseText || '').trim()),
  },
  T8F: {
    expectedLabel: 'tokyo',
    matches: (responseText) => /^tokyo\b/i.test(String(responseText || '').trim()),
  },
  T9F: {
    expectedLabel: '9',
    matches: (responseText) => /^9\b/.test(String(responseText || '').trim()),
  },
};

const MODAL_CLASS_NAME = 'inspect-card-modal';
const MODAL_BODY_CLASS_NAME = 'inspect-card-modal__body';

const SPLIT_LAYOUT_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 0.95fr) minmax(340px, 0.85fr)',
  height: '100%',
  minHeight: 0,
};

const LEFT_PANE_STYLE = {
  padding: '1rem',
  borderRight: '1px solid var(--color-border-strong)',
  overflow: 'auto',
  minHeight: 0,
  background: 'rgba(9, 17, 30, 0.55)',
};

const RIGHT_PANE_STYLE = {
  display: 'grid',
  gridTemplateRows: 'minmax(0, 0.95fr) minmax(220px, 1.05fr)',
  minHeight: 0,
};

const PANEL_STYLE = {
  minHeight: 0,
  padding: '1rem',
  overflow: 'auto',
};

const CASE_ROW_STYLE = {
  border: '1px solid color-mix(in srgb, var(--color-border-strong) 70%, transparent)',
  borderRadius: '12px',
  padding: '0.75rem 0.8rem',
  background: 'color-mix(in srgb, var(--color-surface) 96%, transparent)',
};

const TOOLBAR_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  flexWrap: 'wrap',
  marginBottom: '1rem',
};

const BASE_PORTFOLIO_CARD = {
  id: 'card-portfolio-tc1',
  meta: {
    title: 'My Portfolio',
    tags: ['portfolio'],
    desc: 'Manage your stock holdings — edit tickers and quantities inline, add or delete rows. Changes propagate downstream immediately.',
  },
  provides: [
    {
      bindTo: 'holdings_tc1',
      ref: 'card_data.holdings',
    },
  ],
  compute: [],
  view: {
    elements: [
      {
        kind: 'editable-table',
        label: 'Holdings',
        data: {
          bind: 'card_data.holdings',
          writeTo: 'card_data.holdings',
          columns: ['ticker', 'quantity', 'cost_basis'],
          schema: {
            properties: {
              quantity: { type: 'number' },
              cost_basis: { type: 'number' },
            },
          },
        },
      },
    ],
    layout: {
      board: { col: 4, order: 1 },
      canvas: { x: 50, y: 50, w: 320, h: 340 },
    },
    features: { chat: true },
  },
  card_data: {
    holdings: [
      { ticker: 'AAPL', quantity: 66, cost_basis: 150 },
      { ticker: 'MSFT', quantity: 5, cost_basis: 310 },
      { ticker: 'GOOGL', quantity: 2, cost_basis: 280 },
      { ticker: 'TSLA', quantity: 3, cost_basis: 200 },
    ],
  },
};

const BASE_MARKET_PRICES_CARD = {
  id: 'market-prices-tc2',
  meta: {
    title: 'Market Prices',
    tags: ['prices', 'market'],
    desc: 'Fetches live prices for portfolio tickers. Publishes enriched quote data for downstream portfolio value calculations.',
  },
  requires: ['holdings_tc1'],
  source_defs: [
    {
      bindTo: 'quotes_tc2',
      outputFile: 'market-prices-quotes.json',
      projections: {
        quote_urls: "requires.holdings_tc1.ticker.('https://query1.finance.yahoo.com/v8/finance/chart/' & $ & '?interval=1d&range=1d')",
      },
      urls: {
        url: '{{url}}',
        projectionList: 'quote_urls',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; portfolio-tracker-demo/1.0)',
        },
        cacheTimeout: 3600,
      },
    },
  ],
  compute: [
    {
      bindTo: 'normalizedQuotes',
      expr: "($raw := fetched_sources.quotes_tc2; $rows := $type($raw) = 'array' ? $raw : (($exists($raw.resultValue) and $type($raw.resultValue) = 'array') ? $raw.resultValue : [$raw]); $normalized := $filter($map($rows, function($row) { ($level1 := $exists($row.resultValue) ? $row.resultValue : $row; $level2 := $exists($level1.resultValue) ? $level1.resultValue : $level1; $meta := $level2.chart.result[0].meta; $exists($meta.symbol) ? { \"symbol\": $meta.symbol, \"shortName\": ($exists($meta.longName) ? $meta.longName : $meta.shortName), \"regularMarketPrice\": $meta.regularMarketPrice, \"regularMarketChange\": ($exists($meta.regularMarketChange) ? $meta.regularMarketChange : (($exists($meta.chartPreviousClose) and $exists($meta.regularMarketPrice)) ? ($meta.regularMarketPrice - $meta.chartPreviousClose) : null)), \"regularMarketChangePercent\": ($exists($meta.regularMarketChangePercent) ? $meta.regularMarketChangePercent : (($exists($meta.chartPreviousClose) and $meta.chartPreviousClose != 0 and $exists($meta.regularMarketPrice)) ? (($meta.regularMarketPrice - $meta.chartPreviousClose) / $meta.chartPreviousClose * 100) : null)) } : undefined) }), function($q) { $exists($q.symbol) }); { \"quoteResponse\": { \"result\": $normalized, \"error\": null } })",
    },
    {
      bindTo: 'prices',
      expr: "$map(computed_values.normalizedQuotes.quoteResponse.result, function($q) { {\"ticker\": $q.symbol, \"name\": $q.shortName, \"price\": ($exists($q.regularMarketPrice) ? $round($q.regularMarketPrice, 2) : null), \"change\": ($exists($q.regularMarketChange) ? $round($q.regularMarketChange, 2) : null), \"chg_pct\": ($exists($q.regularMarketChangePercent) ? $round($q.regularMarketChangePercent, 2) : null)} })",
    },
  ],
  provides: [
    {
      bindTo: 'quotes_tc2',
      ref: 'computed_values.normalizedQuotes',
    },
  ],
  view: {
    elements: [
      {
        kind: 'table',
        label: 'Prices',
        data: {
          bind: 'computed_values.prices',
          columns: ['ticker', 'name', 'price', 'change', 'chg_pct'],
          sortable: true,
        },
      },
    ],
    layout: {
      board: { col: 4, order: 2 },
      canvas: { x: 400, y: 50, w: 400, h: 340 },
    },
    features: { refresh: true },
  },
  card_data: {},
};

const BASE_PORTFOLIO_VALUE_CARD = {
  id: 'portfolio-value-tc3',
  meta: {
    title: 'Portfolio Value',
    tags: ['portfolio', 'value'],
    desc: 'Computes total portfolio value, gainers/losers summary, and per-position P&L from holdings and live market quotes.',
  },
  requires: ['holdings_tc1', 'quotes_tc2'],
  provides: [
    { bindTo: 'positions_tc3', ref: 'computed_values.positions' },
  ],
  compute: [
    {
      bindTo: 'positions',
      expr: "($quoteMap := $merge($map(requires.quotes_tc2.quoteResponse.result, function($q) { { $q.symbol: $q } })); $map(requires.holdings_tc1, function($h) { ($q := $lookup($quoteMap, $h.ticker); $qty := $h.quantity; $cb := $h.cost_basis; $price := $number($q.regularMarketPrice); $change := $number($q.regularMarketChange); $cost := $round($cb * $qty, 2); $val := $round($price * $qty, 2); {\"ticker\": $h.ticker, \"quantity\": $qty, \"cost_basis\": $cb, \"price\": $round($price, 2), \"value\": $val, \"gain_$\": $round($val - $cost, 2), \"gain_%\": $cost ? $round(($val - $cost) / $cost * 100, 2) : 0, \"chg_$\": $round($change * $qty, 2), \"chg_pct\": $round($number($q.regularMarketChangePercent), 2)}) }))",
    },
    {
      bindTo: 'totalValue',
      expr: '$round($sum(computed_values.positions.value), 2)',
    },
    {
      bindTo: 'gainers',
      expr: "$count($filter(computed_values.positions, function($p){ $p.chg_pct > 0 }))",
    },
    {
      bindTo: 'losers',
      expr: "$count($filter(computed_values.positions, function($p){ $p.chg_pct < 0 }))",
    },
    {
      bindTo: 'gainersLosers',
      expr: "computed_values.gainers & ' up · ' & computed_values.losers & ' down'",
    },
  ],
  view: {
    elements: [
      {
        kind: 'metric',
        label: 'Portfolio Value ($)',
        data: { bind: 'computed_values.totalValue' },
      },
      {
        kind: 'text',
        data: { bind: 'computed_values.gainersLosers' },
      },
      {
        kind: 'table',
        label: 'Positions',
        data: {
          bind: 'computed_values.positions',
          columns: ['ticker', 'value', 'gain_$', 'gain_%'],
          sortable: true,
        },
      },
    ],
    layout: {
      board: { col: 4, order: 3 },
      canvas: { x: 840, y: 50, w: 420, h: 380 },
    },
    features: { chat: true },
  },
  card_data: {},
};

const SMOKE_CASES = [
  { id: 'MB1', title: 'Ensure board registration', mode: 'run' },
  { id: 'T0', title: 'Seed portfolio and wait for completion', mode: 'run' },
  { id: 'T1', title: 'Discovery and preflight coverage', mode: 'run' },
  {
    id: 'TQ',
    title: 'Queue drain wakeup',
    mode: 'skip',
    reason: 'Browser smoke runner cannot read queue backend internals yet.',
  },
  {
    id: 'TT',
    title: 'Task-executor queue drain',
    mode: 'skip',
    reason: 'Browser smoke runner cannot inspect queue executor leases yet.',
  },
  { id: 'T2', title: 'Portfolio compute end-to-end', mode: 'run' },
  { id: 'T3', title: 'Probe chat lifecycle', mode: 'run' },
  { id: 'T4', title: 'Probe chat with attachment', mode: 'run' },
  {
    id: 'TS',
    title: 'Chat SSE bouquet with attachment',
    mode: 'skip',
    reason: 'Frontend smoke runner validates reduced state only; raw SSE chronology is covered elsewhere.',
  },
  { id: 'T8', title: 'Hosted assistant chat via copilot probe', mode: 'run' },
  { id: 'T9', title: 'Hosted assistant chat via foundry probe', mode: 'run' },
  { id: 'T8F', title: 'Hosted assistant attachment chat via copilot probe', mode: 'run' },
  { id: 'T9F', title: 'Hosted assistant attachment chat via foundry probe', mode: 'run' },
  { id: 'TR', title: 'Card refresh lifecycle over SSE', mode: 'run' },
];

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeJson(entry));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalizeJson(entry)]),
    );
  }
  return value;
}

function jsonText(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function makeClientId(prefix = 'smoke') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeTurnId(prefix = '') {
  const raw = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 6)
    : Math.random().toString(16).slice(2, 8);
  return `${prefix}${raw}`;
}

function normalizeOrigin(origin) {
  return typeof origin === 'string' ? origin.trim().replace(/\/+$/, '') : '';
}

function createCancelError() {
  const error = new Error('Smoke runner cancelled');
  error.code = 'CANCELLED';
  return error;
}

function ensureNotCancelled(cancelRef) {
  if (cancelRef.current) {
    throw createCancelError();
  }
}

function buildProbeChatText(promptText, assistantStem = '') {
  const normalizedPromptText = String(promptText || '');
  const normalizedAssistantStem = typeof assistantStem === 'string' && assistantStem.trim()
    ? assistantStem.trim()
    : 'echo';
  return `${PROBE_ENVELOPE}${normalizedAssistantStem}__${normalizedPromptText}${PROBE_ENVELOPE}`;
}

function buildPortfolioCard(cardId = PORTFOLIO_CARD_ID) {
  const card = cloneJson(BASE_PORTFOLIO_CARD);
  card.id = cardId;
  return card;
}

function buildPortfolioT2Card() {
  const card = buildPortfolioCard(PORTFOLIO_CARD_ID);
  card.card_data = card.card_data && typeof card.card_data === 'object' ? card.card_data : {};
  const holdings = Array.isArray(card.card_data.holdings) ? card.card_data.holdings : [];
  card.card_data.holdings = [
    ...holdings,
    { ticker: 'AMZN', quantity: 4, cost_basis: 180 },
  ];
  return card;
}

function buildMarketPricesCard(cardId = MARKET_PRICES_CARD_ID, quotesToken = 'quotes_tc2') {
  const card = cloneJson(BASE_MARKET_PRICES_CARD);
  card.id = cardId;
  card.provides = Array.isArray(card.provides)
    ? card.provides.map((entry) => (entry?.bindTo === 'quotes_tc2' ? { ...entry, bindTo: quotesToken } : entry))
    : [];
  if (Array.isArray(card.source_defs)) {
    card.source_defs = card.source_defs.map((entry) => (entry?.bindTo === 'quotes_tc2' ? { ...entry, bindTo: quotesToken } : entry));
  }
  return card;
}

function buildPortfolioValueCard(cardId = PORTFOLIO_VALUE_CARD_ID, quotesToken = 'quotes_tc2') {
  const card = cloneJson(BASE_PORTFOLIO_VALUE_CARD);
  card.id = cardId;
  card.requires = ['holdings_tc1', quotesToken];
  card.compute[0].expr = card.compute[0].expr.replaceAll('quotes_tc2', quotesToken);
  return card;
}

function readLatestAssistantText(messages) {
  const latestAssistant = [...(Array.isArray(messages) ? messages : EMPTY_ARRAY)]
    .reverse()
    .find((message) => message?.role === 'assistant' && String(message?.text || '').trim());
  return latestAssistant ? String(latestAssistant.text || '').trim() : '';
}

function createInitialCaseState() {
  return SMOKE_CASES.map((entry) => ({
    id: entry.id,
    title: entry.title,
    mode: entry.mode,
    reason: entry.reason || '',
    status: 'pending',
    detail: '',
    startedAt: 0,
    finishedAt: 0,
  }));
}

function readErrorMessage(payload) {
  if (typeof payload === 'string' && payload.trim()) return payload.trim();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return '';
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim();
  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    const nested = payload.data.error;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
  }
  return '';
}

async function readJsonResponse(response) {
  const contentType = String(response?.headers?.get?.('content-type') || '');
  if (contentType.includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function expectUiSuccess(response, label) {
  const payload = await readJsonResponse(response);
  if (!response?.ok) {
    const message = readErrorMessage(payload) || jsonText(payload || null);
    throw new Error(`${label} returned HTTP ${response?.status ?? 'unknown'}: ${message}`);
  }
  if (payload && typeof payload === 'object' && payload.status === 'fail') {
    const message = readErrorMessage(payload) || jsonText(payload);
    throw new Error(`${label} failed: ${message}`);
  }
  if (payload && typeof payload === 'object' && payload.status === 'success') {
    return payload.data ?? null;
  }
  return payload ?? null;
}

function extractStatusDataFromSsePayload(payload) {
  if (payload?.statusSnapshot && typeof payload.statusSnapshot === 'object') {
    return payload.statusSnapshot;
  }
  if (payload?.kind === 'notification-batch' && Array.isArray(payload.notifications)) {
    for (const notification of payload.notifications) {
      if (notification?.kind === 'status' && notification.status && typeof notification.status === 'object') {
        return notification.status;
      }
    }
  }
  return null;
}

function findBoardStatusCard(statusData, cardId) {
  const cards = Array.isArray(statusData?.cards) ? statusData.cards : [];
  return cards.find((card) => (
    String(card?.['card-id'] || '') === cardId
    || String(card?.name || '') === cardId
    || String(card?.id || '') === cardId
  )) || null;
}

function readStoredCard(readData) {
  return Array.isArray(readData) ? readData[0] || null : null;
}

function computePortfolioExpectation(holdings, priceRows) {
  const holdingsByTicker = Object.fromEntries(
    (Array.isArray(holdings) ? holdings : []).map((entry) => [String(entry?.ticker || '').trim().toUpperCase(), entry]),
  );

  const positions = (Array.isArray(priceRows) ? priceRows : [])
    .map((row) => {
      const ticker = String(row?.symbol || '').trim().toUpperCase();
      const holding = holdingsByTicker[ticker];
      if (!ticker || !holding) return null;
      const quantity = Number(holding?.quantity || 0);
      const costBasis = Number(holding?.cost_basis || 0);
      const price = Number(row?.regularMarketPrice || 0);
      const change = Number(row?.regularMarketChange || 0);
      const changePercent = Number(row?.regularMarketChangePercent || 0);
      const value = roundMoney(price * quantity);
      const totalCost = roundMoney(costBasis * quantity);
      return {
        ticker,
        quantity,
        cost_basis: costBasis,
        price: roundMoney(price),
        value,
        'gain_$': roundMoney(value - totalCost),
        'gain_%': totalCost ? roundMoney(((value - totalCost) / totalCost) * 100) : 0,
        'chg_$': roundMoney(change * quantity),
        chg_pct: roundMoney(changePercent),
      };
    })
    .filter(Boolean);

  return {
    positions,
    totalValue: roundMoney(positions.reduce((sum, row) => sum + Number(row.value || 0), 0)),
  };
}

function createRuntimeState(origin, boardId) {
  return {
    origin,
    boardId,
    latestStatusData: null,
    statusHistory: [],
    subscribedChatCardIds: new Set(),
    createdCardIds: new Set(),
    aiResponsesByCaseId: new Map(),
    lastStatusSignature: '',
  };
}

function buildHookStatusData(board) {
  const entries = Object.entries(board?.cardRuntimes || EMPTY_OBJECT)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([cardId, runtime]) => ({
      'card-id': cardId,
      id: cardId,
      name: cardId,
      status: String(runtime?.status || ''),
      runtime,
    }));

  return {
    summary: board?.boardStatus || null,
    cards: entries,
  };
}

function resolveCardRequireTokens(cardContent) {
  if (Array.isArray(cardContent?.requires)) {
    return cardContent.requires.filter(Boolean).map(String);
  }
  if (cardContent?.requires && typeof cardContent.requires === 'object') {
    return Object.keys(cardContent.requires).filter(Boolean);
  }
  return EMPTY_ARRAY;
}

function buildObservedCardState(board, cardId) {
  const cardContent = board?.cardContents?.[cardId] ?? null;
  const cardRuntime = board?.cardRuntimes?.[cardId] ?? null;
  const cardData = cardContent?.card_data ?? EMPTY_OBJECT;
  const requiresDataObjects = {};
  for (const token of resolveCardRequireTokens(cardContent)) {
    if (token in (board?.dataObjects || EMPTY_OBJECT)) {
      requiresDataObjects[token] = board.dataObjects[token];
    }
  }
  return {
    cardContent,
    cardData,
    cardRuntime,
    requiresDataObjects,
  };
}

function createLogEntry(caseId, message, kind = 'info') {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    caseId,
    kind,
    message,
  };
}

export function SmokeRunner({ serverOrigin, onClose }) {
  const normalizedOrigin = useMemo(() => normalizeOrigin(serverOrigin), [serverOrigin]);
  const board = useBoardState(SMOKE_BOARD_ID);
  const portfolioCardHook = useCardState(SMOKE_BOARD_ID, PORTFOLIO_CARD_ID);
  const marketPricesCardHook = useCardState(SMOKE_BOARD_ID, MARKET_PRICES_CARD_ID);
  const portfolioValueCardHook = useCardState(SMOKE_BOARD_ID, PORTFOLIO_VALUE_CARD_ID);
  const t4CardHook = useCardState(SMOKE_BOARD_ID, T4_CHAT_CARD_ID);
  const t8CardHook = useCardState(SMOKE_BOARD_ID, T8_CHAT_CARD_ID);
  const t9CardHook = useCardState(SMOKE_BOARD_ID, T9_CHAT_CARD_ID);
  const t8fCardHook = useCardState(SMOKE_BOARD_ID, T8F_CHAT_CARD_ID);
  const t9fCardHook = useCardState(SMOKE_BOARD_ID, T9F_CHAT_CARD_ID);
  const trPortfolioCardHook = useCardState(SMOKE_BOARD_ID, TR_PORTFOLIO_CARD_ID);
  const trMarketPricesCardHook = useCardState(SMOKE_BOARD_ID, TR_MARKET_PRICES_CARD_ID);
  const warmupCardHook = useCardState(SMOKE_BOARD_ID, WARMUP_CHAT_CARD_ID);
  const portfolioChatActions = useChatActions(SMOKE_BOARD_ID, PORTFOLIO_CARD_ID);
  const t4ChatActions = useChatActions(SMOKE_BOARD_ID, T4_CHAT_CARD_ID);
  const t8ChatActions = useChatActions(SMOKE_BOARD_ID, T8_CHAT_CARD_ID);
  const t9ChatActions = useChatActions(SMOKE_BOARD_ID, T9_CHAT_CARD_ID);
  const t8fChatActions = useChatActions(SMOKE_BOARD_ID, T8F_CHAT_CARD_ID);
  const t9fChatActions = useChatActions(SMOKE_BOARD_ID, T9F_CHAT_CARD_ID);
  const warmupChatActions = useChatActions(SMOKE_BOARD_ID, WARMUP_CHAT_CARD_ID);
  const { manageBoardsActions } = useManageBoards(normalizedOrigin, { enabled: false });
  const { runtimeCardActions } = useRuntimeCards(SMOKE_BOARD_ID);
  const portfolioChatView = useCardChatViews(SMOKE_BOARD_ID, PORTFOLIO_CARD_ID);
  const t4ChatView = useCardChatViews(SMOKE_BOARD_ID, T4_CHAT_CARD_ID);
  const t8ChatView = useCardChatViews(SMOKE_BOARD_ID, T8_CHAT_CARD_ID);
  const t9ChatView = useCardChatViews(SMOKE_BOARD_ID, T9_CHAT_CARD_ID);
  const t8fChatView = useCardChatViews(SMOKE_BOARD_ID, T8F_CHAT_CARD_ID);
  const t9fChatView = useCardChatViews(SMOKE_BOARD_ID, T9F_CHAT_CARD_ID);
  const warmupChatView = useCardChatViews(SMOKE_BOARD_ID, WARMUP_CHAT_CARD_ID);
  const [suiteStatus, setSuiteStatus] = useState('idle');
  const [suiteError, setSuiteError] = useState('');
  const [activeCaseId, setActiveCaseId] = useState('');
  const [caseStates, setCaseStates] = useState(() => createInitialCaseState());
  const [logs, setLogs] = useState([]);
  const [aiResponses, setAiResponses] = useState({});
  const [startedAt, setStartedAt] = useState(0);
  const [finishedAt, setFinishedAt] = useState(0);
  const cancelRef = useRef(false);
  const runtimeRef = useRef(createRuntimeState(normalizedOrigin, SMOKE_BOARD_ID));
  const boardRef = useRef(board);
  const cardActionsRef = useRef({});
  const chatActionsRef = useRef({});

  const cardStatesById = useMemo(() => ({
    [PORTFOLIO_CARD_ID]: buildObservedCardState(board, PORTFOLIO_CARD_ID),
    [MARKET_PRICES_CARD_ID]: buildObservedCardState(board, MARKET_PRICES_CARD_ID),
    [PORTFOLIO_VALUE_CARD_ID]: buildObservedCardState(board, PORTFOLIO_VALUE_CARD_ID),
    [T4_CHAT_CARD_ID]: buildObservedCardState(board, T4_CHAT_CARD_ID),
    [T8_CHAT_CARD_ID]: buildObservedCardState(board, T8_CHAT_CARD_ID),
    [T9_CHAT_CARD_ID]: buildObservedCardState(board, T9_CHAT_CARD_ID),
    [T8F_CHAT_CARD_ID]: buildObservedCardState(board, T8F_CHAT_CARD_ID),
    [T9F_CHAT_CARD_ID]: buildObservedCardState(board, T9F_CHAT_CARD_ID),
    [TR_PORTFOLIO_CARD_ID]: buildObservedCardState(board, TR_PORTFOLIO_CARD_ID),
    [TR_MARKET_PRICES_CARD_ID]: buildObservedCardState(board, TR_MARKET_PRICES_CARD_ID),
    [WARMUP_CHAT_CARD_ID]: buildObservedCardState(board, WARMUP_CHAT_CARD_ID),
  }), [board]);
  const chatStatesById = useMemo(() => ({
    [PORTFOLIO_CARD_ID]: portfolioChatView?.chatState ?? null,
    [T4_CHAT_CARD_ID]: t4ChatView?.chatState ?? null,
    [T8_CHAT_CARD_ID]: t8ChatView?.chatState ?? null,
    [T9_CHAT_CARD_ID]: t9ChatView?.chatState ?? null,
    [T8F_CHAT_CARD_ID]: t8fChatView?.chatState ?? null,
    [T9F_CHAT_CARD_ID]: t9fChatView?.chatState ?? null,
    [WARMUP_CHAT_CARD_ID]: warmupChatView?.chatState ?? null,
  }), [portfolioChatView, t4ChatView, t8ChatView, t8fChatView, t9ChatView, t9fChatView, warmupChatView]);
  const cardStatesRef = useRef(cardStatesById);
  const chatStatesRef = useRef(chatStatesById);

  useEffect(() => {
    runtimeRef.current = createRuntimeState(normalizedOrigin, SMOKE_BOARD_ID);
  }, [normalizedOrigin]);

  useEffect(() => {
    boardRef.current = board;
    const runtime = runtimeRef.current;
    const statusData = buildHookStatusData(board);
    runtime.latestStatusData = statusData;
    const signature = JSON.stringify(statusData.cards.map((entry) => [entry['card-id'], entry.status]));
    if (signature !== runtime.lastStatusSignature) {
      runtime.lastStatusSignature = signature;
      runtime.statusHistory.push({ at: Date.now(), statusData });
      if (runtime.statusHistory.length > 500) {
        runtime.statusHistory.splice(0, runtime.statusHistory.length - 500);
      }
    }
  }, [board]);

  useEffect(() => {
    cardStatesRef.current = cardStatesById;
  }, [cardStatesById]);

  useEffect(() => {
    cardActionsRef.current = {
      [PORTFOLIO_CARD_ID]: portfolioCardHook?.cardActions ?? null,
      [MARKET_PRICES_CARD_ID]: marketPricesCardHook?.cardActions ?? null,
      [PORTFOLIO_VALUE_CARD_ID]: portfolioValueCardHook?.cardActions ?? null,
      [T4_CHAT_CARD_ID]: t4CardHook?.cardActions ?? null,
      [T8_CHAT_CARD_ID]: t8CardHook?.cardActions ?? null,
      [T9_CHAT_CARD_ID]: t9CardHook?.cardActions ?? null,
      [T8F_CHAT_CARD_ID]: t8fCardHook?.cardActions ?? null,
      [T9F_CHAT_CARD_ID]: t9fCardHook?.cardActions ?? null,
      [TR_PORTFOLIO_CARD_ID]: trPortfolioCardHook?.cardActions ?? null,
      [TR_MARKET_PRICES_CARD_ID]: trMarketPricesCardHook?.cardActions ?? null,
      [WARMUP_CHAT_CARD_ID]: warmupCardHook?.cardActions ?? null,
    };
  }, [marketPricesCardHook, portfolioCardHook, portfolioValueCardHook, t4CardHook, t8CardHook, t8fCardHook, t9CardHook, t9fCardHook, trMarketPricesCardHook, trPortfolioCardHook, warmupCardHook]);

  useEffect(() => {
    chatActionsRef.current = {
      [PORTFOLIO_CARD_ID]: portfolioChatActions,
      [T4_CHAT_CARD_ID]: t4ChatActions,
      [T8_CHAT_CARD_ID]: t8ChatActions,
      [T9_CHAT_CARD_ID]: t9ChatActions,
      [T8F_CHAT_CARD_ID]: t8fChatActions,
      [T9F_CHAT_CARD_ID]: t9fChatActions,
      [WARMUP_CHAT_CARD_ID]: warmupChatActions,
    };
  }, [portfolioChatActions, t4ChatActions, t8ChatActions, t8fChatActions, t9ChatActions, t9fChatActions, warmupChatActions]);

  useEffect(() => {
    chatStatesRef.current = chatStatesById;
  }, [chatStatesById]);

  const appendLog = useCallback((caseId, message, kind = 'info') => {
    const entry = createLogEntry(caseId, message, kind);
    setLogs((current) => [...current, entry]);
    if (caseId) {
      setCaseStates((current) => current.map((entryState) => (
        entryState.id === caseId
          ? { ...entryState, detail: message }
          : entryState
      )));
    }
  }, []);

  const recordAiResponse = useCallback((caseId, responseText) => {
    const normalizedCaseId = String(caseId || '').trim();
    if (!normalizedCaseId) return;
    const normalizedResponseText = String(responseText || '').trim();
    if (!normalizedResponseText) return;
    runtimeRef.current.aiResponsesByCaseId.set(normalizedCaseId, normalizedResponseText);
    setAiResponses((current) => (
      current[normalizedCaseId] === normalizedResponseText
        ? current
        : { ...current, [normalizedCaseId]: normalizedResponseText }
    ));
  }, []);

  const appendAiResponseSummary = useCallback(() => {
    const responseEntries = ['T3', 'T4', 'T8', 'T8F', 'T9', 'T9F']
      .map((caseId) => [caseId, runtimeRef.current.aiResponsesByCaseId.get(caseId) || ''])
      .filter(([, responseText]) => responseText);
    if (responseEntries.length === 0) {
      return;
    }
    appendLog('', 'AI response summary:');
    for (const [caseId, responseText] of responseEntries) {
      appendLog('', `${caseId}: ${responseText}`);
    }
  }, [appendLog]);

  const markCase = useCallback((caseId, patch) => {
    setCaseStates((current) => current.map((entry) => (entry.id === caseId ? { ...entry, ...patch } : entry)));
  }, []);

  const waitUntil = useCallback(async (predicate, timeoutMs, label) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      ensureNotCancelled(cancelRef);
      const result = await predicate();
      if (result !== undefined && result !== null && result !== false) {
        return result;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
    throw new Error(`Timeout (${timeoutMs}ms) waiting for: ${label}`);
  }, []);

  const closeBoardSse = useCallback(async () => {}, []);

  const resetSseState = useCallback(() => {
    const runtime = runtimeRef.current;
    runtime.latestStatusData = null;
    runtime.statusHistory = [];
    runtime.lastStatusSignature = '';
  }, []);

  const ensureBoardSseConnection = useCallback(async () => waitUntil(() => {
    const currentBoard = boardRef.current;
    return currentBoard?.sseClientId ? currentBoard : false;
  }, 15_000, `initial board hook payload for ${SMOKE_BOARD_ID}`), [waitUntil]);

  const reopenBoardSse = useCallback(async () => {
    resetSseState();
    return ensureBoardSseConnection();
  }, [ensureBoardSseConnection, resetSseState]);

  const getCardActions = useCallback((cardId) => {
    const actions = cardActionsRef.current[cardId];
    if (!actions) {
      throw new Error(`Card actions unavailable for ${cardId}`);
    }
    return actions;
  }, []);

  const getChatActions = useCallback((cardId) => {
    const actions = chatActionsRef.current[cardId];
    if (!actions) {
      throw new Error(`Chat actions unavailable for ${cardId}`);
    }
    return actions;
  }, []);

  const upsertCard = useCallback(async (candidateCardContent) => {
    return await runtimeCardActions.upsertRuntimeCard(candidateCardContent);
  }, [runtimeCardActions]);

  const removeCard = useCallback(async (cardId) => {
    return await runtimeCardActions.removeRuntimeCard(cardId);
  }, [runtimeCardActions]);

  const callMcp = useCallback(async (tool, args = {}) => {
    if (tool === 'discover.source-kinds') {
      return await getCardActions(PORTFOLIO_CARD_ID).discoverSourceKinds();
    }
    if (tool === 'preflight.validate-candidate-card-definition') {
      return await getCardActions(PORTFOLIO_CARD_ID).validateCandidateCardDefinition(args.candidate_card_content);
    }
    if (tool === 'preflight.probe-single-source-in-candidate-card') {
      return await getCardActions(PORTFOLIO_CARD_ID).probeSingleSourceInCandidateCard(
        args.candidate_card_content,
        args.source_idx,
        {
          ...(args.mock_requires ? { mockRequires: args.mock_requires } : {}),
          ...(args.mock_projections ? { mockProjections: args.mock_projections } : {}),
        },
      );
    }
    if (tool === 'preflight.run-single-source-in-candidate-card') {
      return await getCardActions(PORTFOLIO_CARD_ID).runSingleSourceInCandidateCard(
        args.candidate_card_content,
        args.source_idx,
        {
          ...(args.mock_requires ? { mockRequires: args.mock_requires } : {}),
          ...(args.mock_projections ? { mockProjections: args.mock_projections } : {}),
        },
      );
    }
    if (tool === 'preflight.run-one-cycle-with-candidate-card') {
      return await getCardActions(PORTFOLIO_CARD_ID).runOneCycleWithCandidateCard(
        args.candidate_card_content,
        {
          ...(args.mock_requires ? { mockRequires: args.mock_requires } : {}),
        },
      );
    }
    if (tool === 'manage.upsert-card') {
      return await upsertCard(args.candidate_card_content);
    }
    if (tool === 'manage.remove-card') {
      return await removeCard(args.card_id);
    }
    throw new Error(`Unsupported SmokeRunner MCP tool: ${tool}`);
  }, [getCardActions, removeCard, upsertCard]);

  const callControlplane = useCallback(async (tool, args = {}) => {
    if (tool === 'sse.subscribe-chat') {
      return await expectUiSuccess(await getChatActions(args.card_id).subscribeChat(), tool);
    }
    if (tool === 'sse.unsubscribe-chat') {
      return await expectUiSuccess(await getChatActions(args.card_id).unsubscribeChat(), tool);
    }
    if (tool === 'manage.add-chat-attachment') {
      const file = new File([String(args.text ?? '')], String(args.file_name || 'upload.txt'), {
        type: String(args.content_type || 'text/plain; charset=utf-8'),
      });
      return await expectUiSuccess(await getChatActions(args.card_id).uploadFileForChat(file, String(args.turn_id || '')), tool);
    }
    throw new Error(`Unsupported SmokeRunner controlplane tool: ${tool}`);
  }, [getChatActions]);

  const callAction = useCallback(async (tool, cardId, payload = {}) => {
    if (tool === 'chat-send') {
      return await expectUiSuccess(
        await getChatActions(cardId).sendChatAction(payload.text, { turnId: payload['turn-id'] || payload.turnId || payload.turn || '' }),
        `${tool}:${cardId}`,
      );
    }
    if (tool === 'retrigger-card') {
      return await expectUiSuccess(await getCardActions(cardId).refresh(), `${tool}:${cardId}`);
    }
    return await expectUiSuccess(await getCardActions(cardId).dispatchAction(tool, payload), `${tool}:${cardId}`);
  }, [getCardActions, getChatActions]);

  const ensureBoardRegistered = useCallback(async () => {
    const runtime = runtimeRef.current;
    const boards = await manageBoardsActions.listBoards();
    const hasBoard = boards.some((entry) => String(entry?.id || '') === runtime.boardId);
    if (hasBoard) {
      return boards;
    }
    await manageBoardsActions.addBoard({
      boardId: runtime.boardId,
      label: runtime.boardId,
      ai: 'copilot',
      aiWorkspaceTemplate: 'default',
      refsTemplate: 'localfs-default',
    });
    return await manageBoardsActions.listBoards();
  }, [manageBoardsActions]);

  const readChatMessages = useCallback(async (cardId, turnId = '') => {
    const messages = Array.isArray(chatStatesRef.current[cardId]?.messages) ? chatStatesRef.current[cardId].messages : EMPTY_ARRAY;
    return turnId ? messages.filter((message) => String(message?.turn || '') === turnId) : messages;
  }, []);

  const readChatProcessing = useCallback(async (cardId) => {
    return chatStatesRef.current[cardId]?.processing === true;
  }, []);

  const subscribeCardChats = useCallback(async (cardId) => {
    const runtime = runtimeRef.current;
    const currentBoard = boardRef.current;
    if (!currentBoard?.sseClientId) {
      throw new Error(`board SSE client id unavailable for ${cardId}`);
    }
    await expectUiSuccess(await getChatActions(cardId).subscribeChat(), `subscribe chat ${cardId}`);
    runtime.subscribedChatCardIds.add(cardId);
  }, [getChatActions]);

  const unsubscribeCardChats = useCallback(async (cardId) => {
    const runtime = runtimeRef.current;
    const currentBoard = boardRef.current;
    if (currentBoard?.sseClientId) {
      await expectUiSuccess(await getChatActions(cardId).unsubscribeChat(), `unsubscribe chat ${cardId}`);
    }
    runtime.subscribedChatCardIds.delete(cardId);
  }, [getChatActions]);

  const pollBoardStatus = useCallback(async (predicate, waitLabel, attempts = 20, gapMs = 1_000) => {
    let lastStatusData = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      ensureNotCancelled(cancelRef);
      const statusData = buildHookStatusData(boardRef.current);
      lastStatusData = statusData;
      if (predicate(statusData)) {
        return { matched: true, attemptsUsed: attempt, statusData };
      }
      if (attempt < attempts) {
        await new Promise((resolve) => window.setTimeout(resolve, gapMs));
      }
    }
    return { matched: false, attemptsUsed: attempts, statusData: lastStatusData, waitLabel };
  }, []);

  const pollChatMessages = useCallback(async (cardId, turnId, predicate, waitLabel, attempts = 12, gapMs = 1_000) => {
    let lastMessages = [];
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      ensureNotCancelled(cancelRef);
      lastMessages = await readChatMessages(cardId, turnId);
      if (predicate(lastMessages)) {
        return { matched: true, attemptsUsed: attempt, messages: lastMessages };
      }
      if (attempt < attempts) {
        await new Promise((resolve) => window.setTimeout(resolve, gapMs));
      }
    }
    return { matched: false, attemptsUsed: attempts, messages: lastMessages, waitLabel };
  }, [readChatMessages]);

  const pollChatProcessing = useCallback(async (cardId, expectedActive, waitLabel, attempts = 12, gapMs = 1_000) => {
    let lastActive = false;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      ensureNotCancelled(cancelRef);
      lastActive = await readChatProcessing(cardId);
      if (lastActive === expectedActive) {
        return { matched: true, attemptsUsed: attempt, active: lastActive };
      }
      if (attempt < attempts) {
        await new Promise((resolve) => window.setTimeout(resolve, gapMs));
      }
    }
    return { matched: false, attemptsUsed: attempts, active: lastActive, waitLabel };
  }, [readChatProcessing]);

  const waitForSseSummary = useCallback(async (label, timeoutMs = 15_000) => waitUntil(() => boardRef.current?.sseClientId ? buildHookStatusData(boardRef.current) : false, timeoutMs, label), [waitUntil]);

  const waitForCompletedCard = useCallback(async (cardId, label, timeoutMs = 15_000) => waitUntil(() => {
    const statusData = buildHookStatusData(boardRef.current);
    const card = findBoardStatusCard(statusData, cardId);
    return card && String(card.status || '') === 'completed' ? { statusData, card } : false;
  }, timeoutMs, label), [waitUntil]);

  const waitForCardStateData = useCallback(async (cardId, label, timeoutMs = 15_000) => waitUntil(() => {
    const cardState = cardStatesRef.current[cardId];
    return cardState?.cardContent ? cardState : false;
  }, timeoutMs, label), [waitUntil]);

  const waitForCardStatus = useCallback(async (cardId, expectedStatus, historyStart, label, timeoutMs = 30_000) => waitUntil(() => {
    const history = runtimeRef.current.statusHistory.slice(historyStart);
    for (const entry of history) {
      const card = findBoardStatusCard(entry.statusData, cardId);
      if (card && String(card.status || '') === expectedStatus) {
        return { statusData: entry.statusData, card };
      }
    }
    return false;
  }, timeoutMs, label), [waitUntil]);

  const warmChatQueue = useCallback(async () => {
    const runtime = runtimeRef.current;
    appendLog('', `[warmup] ensuring board '${SMOKE_BOARD_ID}' is registered`);
    await ensureBoardRegistered();

    appendLog('', `[warmup] requesting board bootstrap for '${SMOKE_BOARD_ID}'`);
    await initBoard(SMOKE_BOARD_ID);

    runtime.createdCardIds.add(WARMUP_CHAT_CARD_ID);
    appendLog('', `[warmup] upserting ${WARMUP_CHAT_CARD_ID}`);
    await callMcp('manage.upsert-card', {
      card_id: WARMUP_CHAT_CARD_ID,
      candidate_card_content: buildPortfolioCard(WARMUP_CHAT_CARD_ID),
    });

    appendLog('', `[warmup] ensuring board SSE connection`);
    await ensureBoardSseConnection();

    appendLog('', `[warmup] subscribing card chat ${WARMUP_CHAT_CARD_ID}`);
    await subscribeCardChats(WARMUP_CHAT_CARD_ID);

    const turnId = `warm${makeTurnId()}`;
    const promptText = 'smoke queue warmup';
    appendLog('', `[warmup] sending chat turn ${turnId}`);
    await callAction('chat-send', WARMUP_CHAT_CARD_ID, {
      text: buildProbeChatText(promptText, 'echo'),
      probe: 'echo',
      'turn-id': turnId,
    });

    appendLog('', `[warmup] verifying user chat entry for ${turnId}`);
    const userPoll = await pollChatMessages(
      WARMUP_CHAT_CARD_ID,
      turnId,
      (messages) => messages.some((message) => message?.role === 'user' && String(message?.text || '') === promptText),
      `warmup user chat message for turn ${turnId}`,
      8,
      500,
    );
    if (!userPoll.matched) {
      throw new Error(`warmup user message not found for turn ${turnId}`);
    }

    appendLog('', `[warmup] polling processing-on for ${WARMUP_CHAT_CARD_ID}`);
    const onPoll = await pollChatProcessing(
      WARMUP_CHAT_CARD_ID,
      true,
      `warmup chat processing on for ${WARMUP_CHAT_CARD_ID}`,
      8,
      1_000,
    );
    if (!onPoll.matched) {
      throw new Error(`warmup chat processing did not turn on for ${WARMUP_CHAT_CARD_ID}`);
    }

    appendLog('', `[warmup] polling assistant reply for ${turnId}`);
    const assistantPoll = await pollChatMessages(
      WARMUP_CHAT_CARD_ID,
      turnId,
      (messages) => messages.some((message) => message?.role === 'assistant' && String(message?.text || '').includes(`Echo: ${promptText}`)),
      `warmup probe final reply for turn ${turnId}`,
      45,
      2_000,
    );
    if (!assistantPoll.matched) {
      throw new Error(`warmup probe final reply not found for turn ${turnId}`);
    }

    appendLog('', `[warmup] polling processing-off for ${WARMUP_CHAT_CARD_ID}`);
    const offPoll = await pollChatProcessing(
      WARMUP_CHAT_CARD_ID,
      false,
      `warmup chat processing off for ${WARMUP_CHAT_CARD_ID}`,
      30,
      1_000,
    );
    if (!offPoll.matched) {
      throw new Error(`warmup chat processing did not turn off for ${WARMUP_CHAT_CARD_ID}`);
    }

    appendLog('', `[warmup] chat queue ready after ${assistantPoll.attemptsUsed} poll(s)`);
  }, [appendLog, callAction, callMcp, ensureBoardRegistered, ensureBoardSseConnection, pollChatMessages, pollChatProcessing, subscribeCardChats]);

  const removeTrackedCards = useCallback(async () => {
    const runtime = runtimeRef.current;
    const ids = [...runtime.createdCardIds].reverse();
    for (const cardId of ids) {
      try {
        await callMcp('manage.remove-card', { card_id: cardId });
        appendLog('', `[cleanup] removed ${cardId}`);
      } catch (error) {
        appendLog('', `[cleanup] remove-card failed for ${cardId}: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    }
    runtime.createdCardIds.clear();
  }, [appendLog, callMcp]);

  const cleanup = useCallback(async () => {
    const runtime = runtimeRef.current;
    for (const cardId of [...runtime.subscribedChatCardIds]) {
      try {
        await unsubscribeCardChats(cardId);
      } catch (error) {
        appendLog('', `[cleanup] chat unsubscribe failed for ${cardId}: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    }
    await closeBoardSse();
    await removeTrackedCards();
    resetSseState();
  }, [appendLog, closeBoardSse, removeTrackedCards, resetSseState, unsubscribeCardChats]);

  const suiteContext = useMemo(() => ({
    boardId: SMOKE_BOARD_ID,
  }), []);

  const runCase = useCallback(async (caseId) => {
    const runtime = runtimeRef.current;
    const recordCard = (cardId) => runtime.createdCardIds.add(cardId);
    const log = (message, kind = 'info') => appendLog(caseId, message, kind);

    if (caseId === 'MB1') {
      log(`ensure board '${suiteContext.boardId}' is registered via /manage-boards`);
      const boards = await ensureBoardRegistered();
      const ids = boards.map((entry) => String(entry?.id || ''));
      log(`board registry contains: ${jsonText(ids)}`);
      return;
    }

    if (caseId === 'T0') {
      log(`upserting ${PORTFOLIO_CARD_ID}`);
      await callMcp('manage.upsert-card', { card_id: PORTFOLIO_CARD_ID, candidate_card_content: buildPortfolioCard(PORTFOLIO_CARD_ID) });
      recordCard(PORTFOLIO_CARD_ID);
      const stored = await waitForCardStateData(PORTFOLIO_CARD_ID, `hook card state for ${PORTFOLIO_CARD_ID}`);
      const expected = buildPortfolioCard(PORTFOLIO_CARD_ID);
      const storedCard = {
        ...stored.cardContent,
        card_data: stored.cardData,
      };
      if (jsonText(canonicalizeJson(storedCard)) !== jsonText(canonicalizeJson(expected))) {
        throw new Error(`hook card state mismatch for ${PORTFOLIO_CARD_ID}`);
      }
      const poll = await pollBoardStatus((statusData) => {
        const card = findBoardStatusCard(statusData, PORTFOLIO_CARD_ID);
        return card && String(card.status || '') === 'completed';
      }, `${PORTFOLIO_CARD_ID} to complete`, 6, 1_000);
      if (!poll.matched) throw new Error(`timed out waiting for ${PORTFOLIO_CARD_ID} to reach completed`);
      log(`${PORTFOLIO_CARD_ID} completed in ${poll.attemptsUsed} poll(s)`);
      return;
    }

    if (caseId === 'T1') {
      log('discover.source-kinds');
      const sourceKinds = await callMcp('discover.source-kinds', {});
      if (!sourceKinds?.sourceKinds || Object.keys(sourceKinds.sourceKinds).length === 0) {
        throw new Error(`discover.source-kinds returned no source kinds: ${jsonText(sourceKinds)}`);
      }
      log(`discover.source-kinds ok: ${Object.keys(sourceKinds.sourceKinds).length} kind(s)`);

      const marketPricesCard = buildMarketPricesCard(MARKET_PRICES_CARD_ID);
      const portfolioValueCard = buildPortfolioValueCard(PORTFOLIO_VALUE_CARD_ID);

      const marketPricesPreflight = await callMcp('preflight.validate-candidate-card-definition', {
        candidate_card_content: marketPricesCard,
      });
      if (marketPricesPreflight?.cardId !== MARKET_PRICES_CARD_ID || marketPricesPreflight?.isValid !== true) {
        throw new Error(`market-prices candidate preflight failed: ${jsonText(marketPricesPreflight)}`);
      }
      log('market-prices candidate preflight passed');

      const storedPortfolio = await waitForCardStateData(PORTFOLIO_CARD_ID, `hook card state for ${PORTFOLIO_CARD_ID}`);
      const holdings = storedPortfolio?.cardData?.holdings;
      if (!Array.isArray(holdings) || holdings.length === 0) {
        throw new Error('portfolio holdings missing for market-prices preflight');
      }
      const mockProjections = {
        quote_urls: holdings
          .map((row) => `https://query1.finance.yahoo.com/v8/finance/chart/${String(row?.ticker || '').trim().toUpperCase()}?interval=1d&range=1d`)
          .filter(Boolean),
      };

      const sourceProbe = await callMcp('preflight.probe-single-source-in-candidate-card', {
        candidate_card_content: marketPricesCard,
        source_idx: 0,
        mock_projections: mockProjections,
      });
      if (sourceProbe?.bindTo !== 'quotes_tc2' || sourceProbe?.reachable !== true) {
        throw new Error(`market-prices source probe failed: ${jsonText(sourceProbe)}`);
      }
      log('market-prices source probe passed');

      const sourceRun = await callMcp('preflight.run-single-source-in-candidate-card', {
        candidate_card_content: marketPricesCard,
        source_idx: 0,
        mock_projections: mockProjections,
      });
      if (sourceRun?.bindTo !== 'quotes_tc2' || sourceRun?.ok !== true) {
        throw new Error(`market-prices source run failed: ${jsonText(sourceRun)}`);
      }
      log('market-prices source run passed');

      const cycle = await callMcp('preflight.run-one-cycle-with-candidate-card', {
        candidate_card_content: marketPricesCard,
        mock_requires: { holdings_tc1: holdings },
      });
      if (cycle?.cardId !== MARKET_PRICES_CARD_ID || cycle?.ok !== true || !cycle?.provides_outputs?.quotes_tc2?.quoteResponse) {
        throw new Error(`market-prices cycle preflight failed: ${jsonText(cycle)}`);
      }
      log('market-prices one-cycle preflight passed');

      const portfolioValuePreflight = await callMcp('preflight.validate-candidate-card-definition', {
        candidate_card_content: portfolioValueCard,
      });
      if (portfolioValuePreflight?.cardId !== PORTFOLIO_VALUE_CARD_ID || portfolioValuePreflight?.isValid !== true) {
        throw new Error(`portfolio-value candidate preflight failed: ${jsonText(portfolioValuePreflight)}`);
      }
      log('portfolio-value candidate preflight passed');
      return;
    }

    if (caseId === 'T2') {
      log(`step 1/7: upserting ${PORTFOLIO_CARD_ID}`);
      await callMcp('manage.upsert-card', {
        card_id: PORTFOLIO_CARD_ID,
        candidate_card_content: buildPortfolioT2Card(),
      });
      recordCard(PORTFOLIO_CARD_ID);

      log(`step 2/7: upserting ${MARKET_PRICES_CARD_ID}`);
      await callMcp('manage.upsert-card', {
        card_id: MARKET_PRICES_CARD_ID,
        candidate_card_content: buildMarketPricesCard(MARKET_PRICES_CARD_ID),
      });
      recordCard(MARKET_PRICES_CARD_ID);

      log(`step 3/7: upserting ${PORTFOLIO_VALUE_CARD_ID}`);
      await callMcp('manage.upsert-card', {
        card_id: PORTFOLIO_VALUE_CARD_ID,
        candidate_card_content: buildPortfolioValueCard(PORTFOLIO_VALUE_CARD_ID),
      });
      recordCard(PORTFOLIO_VALUE_CARD_ID);

      log(`step 4/7: waiting for ${MARKET_PRICES_CARD_ID} and ${PORTFOLIO_VALUE_CARD_ID} to complete`);
      const poll = await pollBoardStatus((statusData) => {
        const marketCard = findBoardStatusCard(statusData, MARKET_PRICES_CARD_ID);
        const valueCard = findBoardStatusCard(statusData, PORTFOLIO_VALUE_CARD_ID);
        return marketCard && valueCard && String(marketCard.status || '') === 'completed' && String(valueCard.status || '') === 'completed';
      }, 'dependent cards to complete', 12, 1_000);
      if (!poll.matched) throw new Error(`timed out waiting for dependent cards to complete: ${jsonText(poll.statusData)}`);

      log(`step 5/7: reading hook state for ${PORTFOLIO_CARD_ID}`);
      const storedPortfolio = await waitForCardStateData(PORTFOLIO_CARD_ID, `hook card state for ${PORTFOLIO_CARD_ID}`);

      log(`step 6/7: reading hook runtime for ${MARKET_PRICES_CARD_ID} and ${PORTFOLIO_VALUE_CARD_ID}`);
      const marketRuntime = await waitForCardStateData(MARKET_PRICES_CARD_ID, `hook card state for ${MARKET_PRICES_CARD_ID}`);
      const portfolioRuntime = await waitForCardStateData(PORTFOLIO_VALUE_CARD_ID, `hook card state for ${PORTFOLIO_VALUE_CARD_ID}`);
      const holdings = storedPortfolio?.cardData?.holdings;
      const priceRows = portfolioRuntime?.requiresDataObjects?.quotes_tc2?.quoteResponse?.result
        || marketRuntime?.requiresDataObjects?.quotes_tc2?.quoteResponse?.result
        || marketRuntime?.cardRuntime?.computed_values?.normalizedQuotes?.quoteResponse?.result
        || marketRuntime?.cardRuntime?.computed_values?.prices
        || EMPTY_ARRAY;
      const positions = portfolioRuntime?.cardRuntime?.computed_values?.positions;
      const totalValue = Number(portfolioRuntime?.cardRuntime?.computed_values?.totalValue);
      if (!Array.isArray(holdings) || !Array.isArray(priceRows) || !Array.isArray(positions) || !Number.isFinite(totalValue)) {
        throw new Error(`runtime payload missing expected compute data`);
      }
      const expected = computePortfolioExpectation(holdings, priceRows);
      if (roundMoney(totalValue) !== expected.totalValue) {
        throw new Error(`totalValue mismatch: expected ${expected.totalValue}, got ${roundMoney(totalValue)}`);
      }
      if (jsonText(canonicalizeJson(positions)) !== jsonText(canonicalizeJson(expected.positions))) {
        throw new Error(`positions mismatch between runtime and expected compute`);
      }
      log(`step 7/7: total portfolio value verified: ${expected.totalValue}`);
      return;
    }

    if (caseId === 'T3') {
      log(`step 0/7: upserting ${PORTFOLIO_CARD_ID} for chat`);
      await callMcp('manage.upsert-card', {
        card_id: PORTFOLIO_CARD_ID,
        candidate_card_content: buildPortfolioCard(PORTFOLIO_CARD_ID),
      });
      recordCard(PORTFOLIO_CARD_ID);
      await ensureBoardSseConnection();
      await subscribeCardChats(PORTFOLIO_CARD_ID);

      const turnId = makeTurnId();
      const promptText = 'hi testing';
      const probeText = buildProbeChatText(promptText, 'echo');

      log(`step 1/7: sending chat turn ${turnId}`);
      await callAction('chat-send', PORTFOLIO_CARD_ID, {
        text: probeText,
        probe: 'echo',
        'turn-id': turnId,
      });

      log(`step 2/7: verifying user chat entry is stored`);
      const userPoll = await pollChatMessages(PORTFOLIO_CARD_ID, turnId, (messages) => messages.some((message) => message?.role === 'user' && String(message?.text || '') === promptText), `user chat message for turn ${turnId}`, 8, 500);
      if (!userPoll.matched) throw new Error(`user message not found for turn ${turnId}`);

      log(`step 3/7: verifying chat processing turns on`);
      const onPoll = await pollChatProcessing(PORTFOLIO_CARD_ID, true, `chat processing on for ${PORTFOLIO_CARD_ID}`, 8, 1_000);
      if (!onPoll.matched) throw new Error(`chat processing did not turn on for ${PORTFOLIO_CARD_ID}`);

      const expectedReply = `Echo: ${promptText}`;
      log(`step 4/7: waiting for probe final reply`);
      const assistantPoll = await pollChatMessages(PORTFOLIO_CARD_ID, turnId, (messages) => messages.some((message) => message?.role === 'assistant' && String(message?.text || '').includes(expectedReply)), `probe final reply for turn ${turnId}`, 16, 1_000);
      if (!assistantPoll.matched) {
        recordAiResponse('T3', readLatestAssistantText(assistantPoll.messages));
        throw new Error(`probe final reply not found for turn ${turnId}`);
      }

      log(`step 5/7: verifying chat processing turns off`);
      const offPoll = await pollChatProcessing(PORTFOLIO_CARD_ID, false, `chat processing off for ${PORTFOLIO_CARD_ID}`, 16, 1_000);
      if (!offPoll.matched) throw new Error(`chat processing did not turn off for ${PORTFOLIO_CARD_ID}`);

      log(`step 6/7: verifying final inspected messages`);
      const finalMessages = await readChatMessages(PORTFOLIO_CARD_ID, turnId);
      const finalUser = finalMessages.find((message) => message?.role === 'user');
      const finalAssistant = finalMessages.find((message) => message?.role === 'assistant');
      if (!finalUser || !finalAssistant) throw new Error(`final persisted messages missing for turn ${turnId}`);
      recordAiResponse('T3', String(finalAssistant.text || ''));
      if (String(finalUser.text || '') !== promptText || !String(finalAssistant.text || '').includes(expectedReply)) {
        throw new Error(`final chat messages mismatch for turn ${turnId}`);
      }

      log(`step 7/7: verifying live /sse board-state bootstrap`);
      await reopenBoardSse();
      await waitForSseSummary(`T3 SSE summary for ${PORTFOLIO_CARD_ID}`);
      await waitForCompletedCard(PORTFOLIO_CARD_ID, `T3 SSE completed status for ${PORTFOLIO_CARD_ID}`);
      await closeBoardSse();
      resetSseState();
      return;
    }

    if (caseId === 'T4') {
      log(`step 0/8: upserting ${T4_CHAT_CARD_ID} for chat`);
      await callMcp('manage.upsert-card', {
        card_id: T4_CHAT_CARD_ID,
        candidate_card_content: buildPortfolioCard(T4_CHAT_CARD_ID),
      });
      recordCard(T4_CHAT_CARD_ID);
      await ensureBoardSseConnection();
      await subscribeCardChats(T4_CHAT_CARD_ID);

      const turnId = `t4${makeTurnId()}`;
      const promptText = 'what is the content in the attached file';
      const probeText = buildProbeChatText(promptText, 'echoattach');
      const expectedReply = 'what is the capital of japan';

      log(`step 1/8: adding chat attachment for turn ${turnId}`);
      const uploadResult = await callControlplane('manage.add-chat-attachment', {
        card_id: T4_CHAT_CARD_ID,
        turn_id: turnId,
        file_name: 't4-probe.txt',
        content_type: 'text/plain; charset=utf-8',
        text: expectedReply,
      });
      const uploadedFile = Array.isArray(uploadResult?.files) ? uploadResult.files[0] : null;
      if (!uploadedFile || Object.prototype.hasOwnProperty.call(uploadedFile, 'path')) {
        throw new Error('chat attachment metadata invalid after upload');
      }

      const storedCard = await waitForCardStateData(T4_CHAT_CARD_ID, `hook card state for ${T4_CHAT_CARD_ID}`);
      const storedFiles = Array.isArray(storedCard?.cardData?.files) ? storedCard.cardData.files : EMPTY_ARRAY;
      const storedFile = storedFiles.find((entry) => String(entry?.stored_name || '') === String(uploadedFile?.stored_name || ''));
      if (!storedFile || storedFile?.chat !== true || Object.prototype.hasOwnProperty.call(storedFile || {}, 'path')) {
        throw new Error('stored chat attachment metadata invalid after upload');
      }

      const afterUploadMessages = await readChatMessages(T4_CHAT_CARD_ID, turnId);
      const uploadSystemMessage = afterUploadMessages.find((message) => message?.role === 'system');
      if (!uploadSystemMessage || !String(uploadSystemMessage?.text || '').toLowerCase().includes('file uploaded:')) {
        throw new Error('upload system message missing after attachment upload');
      }

      log(`step 2/8: sending probe chat turn ${turnId} with attachment`);
      await callAction('chat-send', T4_CHAT_CARD_ID, {
        text: probeText,
        probe: 'echoattach',
        'turn-id': turnId,
      });

      log(`step 3/8: verifying user chat entry is stored`);
      const userPoll = await pollChatMessages(T4_CHAT_CARD_ID, turnId, (messages) => messages.some((message) => message?.role === 'user' && String(message?.text || '') === promptText), `user chat message for turn ${turnId}`, 8, 500);
      if (!userPoll.matched) throw new Error(`user message not found for turn ${turnId}`);

      log(`step 4/8: verifying chat processing turns on`);
      const onPoll = await pollChatProcessing(T4_CHAT_CARD_ID, true, `chat processing on for ${T4_CHAT_CARD_ID}`, 8, 1_000);
      if (!onPoll.matched) throw new Error(`chat processing did not turn on for ${T4_CHAT_CARD_ID}`);

      log(`step 5/8: waiting for probe final reply`);
      const assistantPoll = await pollChatMessages(T4_CHAT_CARD_ID, turnId, (messages) => messages.some((message) => message?.role === 'assistant' && String(message?.text || '').includes(expectedReply)), `probe final reply for turn ${turnId}`, 16, 1_000);
      if (!assistantPoll.matched) {
        recordAiResponse('T4', readLatestAssistantText(assistantPoll.messages));
        throw new Error(`probe final reply not found for turn ${turnId}`);
      }

      log(`step 6/8: verifying chat processing turns off`);
      const offPoll = await pollChatProcessing(T4_CHAT_CARD_ID, false, `chat processing off for ${T4_CHAT_CARD_ID}`, 16, 1_000);
      if (!offPoll.matched) throw new Error(`chat processing did not turn off for ${T4_CHAT_CARD_ID}`);

      log(`step 7/8: verifying final inspected messages`);
      const finalMessages = await readChatMessages(T4_CHAT_CARD_ID, turnId);
      const finalUser = finalMessages.find((message) => message?.role === 'user');
      const finalAssistant = finalMessages.find((message) => message?.role === 'assistant');
      const finalSystem = finalMessages.find((message) => message?.role === 'system' && String(message?.text || '').toLowerCase().includes('file uploaded:'));
      if (!finalUser || !finalAssistant || !finalSystem) {
        throw new Error(`final attachment turn messages missing for ${turnId}`);
      }
      recordAiResponse('T4', String(finalAssistant.text || ''));
      if (String(finalUser.text || '') !== promptText || !String(finalAssistant.text || '').includes(expectedReply)) {
        throw new Error(`final attachment probe messages mismatch for ${turnId}`);
      }
      log(`step 8/8: final probe reply with attachment contents passed`);
      return;
    }

    if (caseId === 'TS') {
      throw new Error('TS is intentionally disabled in the frontend smoke runner; raw SSE chronology is out of scope here.');
    }

    if (caseId === 'T8' || caseId === 'T9' || caseId === 'T8F' || caseId === 'T9F') {
      return;
    }

    if (caseId === 'TR') {
      log(`step 0/6: seeding ${TR_PORTFOLIO_CARD_ID}`);
      await callMcp('manage.upsert-card', {
        card_id: TR_PORTFOLIO_CARD_ID,
        candidate_card_content: buildPortfolioCard(TR_PORTFOLIO_CARD_ID),
      });
      recordCard(TR_PORTFOLIO_CARD_ID);

      log(`step 1/6: subscribing board SSE before upserting ${TR_MARKET_PRICES_CARD_ID}`);
      await reopenBoardSse();
      await waitForSseSummary(`TR SSE summary before ${TR_MARKET_PRICES_CARD_ID} upsert`);
      log(`step 2/6: upserting ${TR_MARKET_PRICES_CARD_ID}`);
      await callMcp('manage.upsert-card', {
        card_id: TR_MARKET_PRICES_CARD_ID,
        candidate_card_content: buildMarketPricesCard(TR_MARKET_PRICES_CARD_ID, TR_QUOTES_TOKEN),
      });
      recordCard(TR_MARKET_PRICES_CARD_ID);

      log(`step 3/6: waiting for hook status completed for ${TR_MARKET_PRICES_CARD_ID}`);
      await waitForCardStatus(TR_MARKET_PRICES_CARD_ID, 'completed', 0, `TR initial completed for ${TR_MARKET_PRICES_CARD_ID}`);

      const historyStart = runtime.statusHistory.length;

      log(`step 4/6: issuing card refresh action for ${TR_MARKET_PRICES_CARD_ID}`);
      await callAction('retrigger-card', TR_MARKET_PRICES_CARD_ID, {});

      log(`step 5/6: waiting for board status notification with ${TR_MARKET_PRICES_CARD_ID} running`);
      await waitForCardStatus(TR_MARKET_PRICES_CARD_ID, 'running', historyStart, `TR running status for ${TR_MARKET_PRICES_CARD_ID}`);

      log(`step 6/6: waiting for board status notification with ${TR_MARKET_PRICES_CARD_ID} completed`);
      await waitForCardStatus(TR_MARKET_PRICES_CARD_ID, 'completed', historyStart, `TR completed status for ${TR_MARKET_PRICES_CARD_ID}`);
      await closeBoardSse();
      resetSseState();
      return;
    }

    throw new Error(`Unknown smoke case: ${caseId}`);
  }, [appendLog, callAction, callControlplane, callMcp, closeBoardSse, ensureBoardRegistered, pollBoardStatus, pollChatMessages, pollChatProcessing, readChatMessages, reopenBoardSse, resetSseState, suiteContext.boardId, subscribeCardChats, unsubscribeCardChats, waitForCardStateData, waitForCardStatus, waitForCompletedCard, waitForSseSummary]);

  const runHostedAssistantSmoke = useCallback(async ({
    caseId,
    cardId,
    assistantStem,
    promptText,
    assistantPattern,
    attachment = null,
  }) => {
    const log = (message) => appendLog(caseId, message);
    const recordCard = (nextCardId) => runtimeRef.current.createdCardIds.add(nextCardId);

    log(`step 0/6: upserting ${cardId} for chat`);
    await callMcp('manage.upsert-card', {
      card_id: cardId,
      candidate_card_content: buildPortfolioCard(cardId),
    });
    recordCard(cardId);

    log(`step 1/6: subscribing chat SSE for ${cardId}`);
    await subscribeCardChats(cardId);

    const turnId = `${String(caseId || '').toLowerCase()}_${makeTurnId()}`;
    const markedPrompt = buildProbeChatText(promptText, assistantStem);

    if (attachment) {
      log(`step 2/6: adding chat attachment for turn ${turnId}`);
      const uploadResult = await callControlplane('manage.add-chat-attachment', {
        card_id: cardId,
        turn_id: turnId,
        file_name: attachment.fileName,
        content_type: 'text/plain; charset=utf-8',
        text: attachment.text,
      });
      const uploadedFile = Array.isArray(uploadResult?.files) ? uploadResult.files[0] : null;
      if (!uploadedFile || Object.prototype.hasOwnProperty.call(uploadedFile, 'path')) {
        throw new Error(`${caseId} upload response missing safe file metadata`);
      }

      const afterUploadMessages = await readChatMessages(cardId, turnId);
      const uploadSystem = afterUploadMessages.find((message) => message?.role === 'system');
      if (!uploadSystem || !String(uploadSystem.text || '').toLowerCase().includes('file uploaded:')) {
        throw new Error(`${caseId} upload protocol missing system chat message`);
      }
    }

    log(`step 3/6: sending hosted chat turn ${turnId}`);
    await callAction('chat-send', cardId, {
      text: markedPrompt,
      'turn-id': turnId,
    });

    const userPoll = await pollChatMessages(
      cardId,
      turnId,
      (messages) => messages.some((message) => message?.role === 'user' && String(message?.text || '') === promptText),
      `${caseId} user chat message for turn ${turnId}`,
      8,
      500,
    );
    if (!userPoll.matched) {
      throw new Error(`${caseId} user message not found for turn ${turnId}`);
    }

    log(`step 4/6: waiting for final assistant reply for ${turnId}`);
    const assistantPoll = await pollChatMessages(
      cardId,
      turnId,
      (messages) => messages.some((message) => message?.role === 'assistant' && assistantPattern.test(String(message?.text || '').trim())),
      `${caseId} final assistant reply for turn ${turnId}`,
      Math.max(12, Math.ceil(NON_PROBE_RESPONSE_TIMEOUT_MS / 1000)),
      1_000,
    );
    if (!assistantPoll.matched) {
      recordAiResponse(caseId, readLatestAssistantText(assistantPoll.messages));
      throw new Error(`${caseId} final assistant reply not found for turn ${turnId}`);
    }

    log(`step 5/6: verifying reduced turn state for ${turnId}`);
    const finalMessages = await readChatMessages(cardId, turnId);
    const finalUser = finalMessages.find((message) => message?.role === 'user');
    const finalAssistant = [...finalMessages].reverse().find((message) => message?.role === 'assistant');
    if (!finalUser || !finalAssistant) {
      throw new Error(`${caseId} final turn messages missing for ${turnId}`);
    }
    recordAiResponse(caseId, String(finalAssistant.text || ''));
    if (String(finalUser.text || '') !== promptText) {
      throw new Error(`${caseId} final user text mismatch for turn ${turnId}`);
    }
    if (!assistantPattern.test(String(finalAssistant.text || '').trim())) {
      throw new Error(`${caseId} final assistant text mismatch for turn ${turnId}`);
    }
    if (attachment) {
      const finalSystem = finalMessages.find((message) => message?.role === 'system' && String(message?.text || '').toLowerCase().includes('file uploaded:'));
      if (!finalSystem) {
        throw new Error(`${caseId} final attachment system message missing for turn ${turnId}`);
      }
    }

    const offPoll = await pollChatProcessing(
      cardId,
      false,
      `${caseId} chat processing off for ${cardId}`,
      Math.max(12, Math.ceil(NON_PROBE_RESPONSE_TIMEOUT_MS / 1000)),
      1_000,
    );
    if (!offPoll.matched) {
      throw new Error(`${caseId} chat processing did not turn off for ${cardId}`);
    }
    log(`step 6/6: verifying shared reduced board state for ${cardId}`);
    await waitForCompletedCard(cardId, `${caseId} SSE completed status for ${cardId}`, 30_000);
    log(`final assistant reply: ${String(finalAssistant.text || '')}`);
  }, [appendLog, callAction, callControlplane, callMcp, pollChatMessages, pollChatProcessing, readChatMessages, subscribeCardChats, waitForCompletedCard]);

  const runHostedAssistantCasesInParallel = useCallback(async () => {
    const hostedConfigs = [
      {
        caseId: 'T8',
        cardId: T8_CHAT_CARD_ID,
        assistantStem: 'copilot',
        promptText: 'Just answer what is the capital of France. No fluff. No commentary. No markup. Respond in lower case in one word.',
        assistantPattern: /paris/i,
      },
      {
        caseId: 'T9',
        cardId: T9_CHAT_CARD_ID,
        assistantStem: 'foundry',
        promptText: 'Just answer what is the capital of France. No fluff. No commentary. No markup. Respond in lower case in one word.',
        assistantPattern: /paris/i,
      },
      {
        caseId: 'T8F',
        cardId: T8F_CHAT_CARD_ID,
        assistantStem: 'copilot',
        promptText: 'Answer the question in attached file in one word lower case.',
        assistantPattern: /^tokyo\b/i,
        attachment: {
          fileName: 't8f-question.txt',
          text: 'What is the capital of Japan',
        },
      },
      {
        caseId: 'T9F',
        cardId: T9F_CHAT_CARD_ID,
        assistantStem: 'foundry',
        promptText: 'Answer the matheamtical question in the attached file.  Only the final numerical answer in digits please',
        assistantPattern: /^9\b/,
        attachment: {
          fileName: 't9f-question.txt',
          text: 'What is two plus three plus four?',
        },
      },
    ].filter((config) => SMOKE_CASES.some((entry) => entry.id === config.caseId && entry.mode === 'run'));

    appendLog('', `Hosted chat smoke tests: running ${hostedConfigs.map((config) => config.caseId).join(', ')} in parallel on shared reduced state`);
    await reopenBoardSse();
    await waitForSseSummary('Hosted shared SSE summary', 15_000);
    await Promise.all(hostedConfigs.map((config) => runHostedAssistantSmoke(config)));
    for (const config of hostedConfigs) {
      await unsubscribeCardChats(config.cardId);
    }
  }, [appendLog, reopenBoardSse, runHostedAssistantSmoke, unsubscribeCardChats, waitForSseSummary]);

  const handleRun = useCallback(async () => {
    if (suiteStatus === 'running') {
      return;
    }
    if (!normalizedOrigin) {
      setSuiteStatus('failed');
      setSuiteError('Server origin is required for smoke testing.');
      return;
    }

    cancelRef.current = false;
    runtimeRef.current = {
      ...createRuntimeState(normalizedOrigin, SMOKE_BOARD_ID),
      createdCardIds: new Set(),
    };
    setSuiteStatus('running');
    setSuiteError('');
    setActiveCaseId('');
    setCaseStates(createInitialCaseState());
    setLogs([]);
    setAiResponses({});
    setStartedAt(Date.now());
    setFinishedAt(0);
    appendLog('', `Smoke runner targeting board '${SMOKE_BOARD_ID}' at ${normalizedOrigin}`);

    try {
      await warmChatQueue();
      let hostedParallelHandled = false;
      for (const entry of SMOKE_CASES) {
        ensureNotCancelled(cancelRef);
        setActiveCaseId(entry.id);
        if (entry.mode === 'skip') {
          markCase(entry.id, {
            status: 'skipped',
            detail: entry.reason,
            startedAt: Date.now(),
            finishedAt: Date.now(),
          });
          appendLog(entry.id, entry.reason, 'warn');
          continue;
        }

        if (['T8', 'T9', 'T8F', 'T9F'].includes(entry.id)) {
          if (hostedParallelHandled) {
            continue;
          }
          hostedParallelHandled = true;
          const hostedEntries = SMOKE_CASES.filter((candidate) => ['T8', 'T9', 'T8F', 'T9F'].includes(candidate.id) && candidate.mode === 'run');
          const startedAtValue = Date.now();
          for (const hostedEntry of hostedEntries) {
            markCase(hostedEntry.id, { status: 'running', startedAt: startedAtValue, finishedAt: 0, detail: 'Running in parallel…' });
            appendLog(hostedEntry.id, `Starting ${hostedEntry.id}: ${hostedEntry.title}`);
          }
          try {
            await runHostedAssistantCasesInParallel();
            const finishedAtValue = Date.now();
            for (const hostedEntry of hostedEntries) {
              markCase(hostedEntry.id, { status: 'passed', finishedAt: finishedAtValue });
              appendLog(hostedEntry.id, `${hostedEntry.id} passed`, 'success');
            }
          } catch (error) {
            if (error?.code === 'CANCELLED') {
              throw error;
            }
            const message = error instanceof Error ? error.message : String(error);
            const failedCaseId = hostedEntries.find((hostedEntry) => message.includes(hostedEntry.id))?.id || entry.id;
            const finishedAtValue = Date.now();
            for (const hostedEntry of hostedEntries) {
              markCase(hostedEntry.id, {
                status: hostedEntry.id === failedCaseId ? 'failed' : 'pending',
                finishedAt: finishedAtValue,
                detail: hostedEntry.id === failedCaseId ? message : 'Skipped after parallel group failure.',
              });
            }
            appendLog(failedCaseId, message, 'error');
            throw error;
          }
          continue;
        }

        markCase(entry.id, { status: 'running', startedAt: Date.now(), finishedAt: 0, detail: 'Running…' });
        appendLog(entry.id, `Starting ${entry.id}: ${entry.title}`);
        try {
          await runCase(entry.id);
          markCase(entry.id, { status: 'passed', finishedAt: Date.now() });
          appendLog(entry.id, `${entry.id} passed`, 'success');
        } catch (error) {
          if (error?.code === 'CANCELLED') {
            throw error;
          }
          markCase(entry.id, {
            status: 'failed',
            finishedAt: Date.now(),
            detail: error instanceof Error ? error.message : String(error),
          });
          appendLog(entry.id, error instanceof Error ? error.message : String(error), 'error');
          throw error;
        }
      }

      setSuiteStatus('passed');
      setFinishedAt(Date.now());
      appendAiResponseSummary();
      appendLog('', 'Selected smoke cases passed', 'success');
    } catch (error) {
      if (error?.code === 'CANCELLED') {
        setSuiteStatus('cancelled');
        setFinishedAt(Date.now());
        appendAiResponseSummary();
        appendLog('', 'Smoke runner cancelled', 'warn');
      } else {
        setSuiteStatus('failed');
        setFinishedAt(Date.now());
        setSuiteError(error instanceof Error ? error.message : String(error));
        appendAiResponseSummary();
        appendLog('', `[FAIL] ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    } finally {
      await cleanup();
      setActiveCaseId('');
    }
  }, [appendAiResponseSummary, appendLog, cleanup, markCase, normalizedOrigin, runCase, runHostedAssistantCasesInParallel, suiteStatus, warmChatQueue]);

  const handleStop = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const handleCopyReport = useCallback(async () => {
    const summary = caseStates.map((entry) => `${entry.id}: ${entry.status}${entry.detail ? ` — ${entry.detail}` : ''}`).join('\n');
    const logText = logs.map((entry) => `[${new Date(entry.at).toLocaleTimeString()}]${entry.caseId ? ` [${entry.caseId}]` : ''} ${entry.message}`).join('\n');
    const report = `Smoke Runner (${SMOKE_BOARD_ID})\nStatus: ${suiteStatus}\n\nCases\n${summary}\n\nLog\n${logText}`;
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(report);
      appendLog('', 'Copied smoke report to clipboard');
    }
  }, [appendLog, caseStates, logs, suiteStatus]);

  const summaryChips = useMemo(() => {
    const counts = caseStates.reduce((acc, entry) => {
      acc[entry.status] = (acc[entry.status] || 0) + 1;
      return acc;
    }, {});
    return [
      { label: `Target ${SMOKE_BOARD_ID}`, variant: 'active' },
      { label: `Passed ${counts.passed || 0}`, variant: 'ok' },
      { label: `Failed ${counts.failed || 0}`, variant: counts.failed ? 'fail' : '' },
      { label: `Skipped ${counts.skipped || 0}`, variant: '' },
      { label: `Pending ${counts.pending || 0}`, variant: '' },
    ];
  }, [caseStates]);

  const orderedAiResponses = useMemo(() => {
    return AI_RESPONSE_CASE_ORDER
      .filter((caseId) => typeof aiResponses[caseId] === 'string' && aiResponses[caseId].trim())
      .map((caseId) => {
        const responseText = aiResponses[caseId].trim();
        const expectation = AI_RESPONSE_EXPECTATIONS[caseId];
        const isMatch = expectation ? expectation.matches(responseText) : true;
        return {
          caseId,
          responseText,
          expectedLabel: !isMatch && expectation ? expectation.expectedLabel : '',
          statusMark: isMatch ? '✓' : '✗',
        };
      });
  }, [aiResponses]);

  const durationText = startedAt
    ? `${Math.max(0, Math.round(((finishedAt || Date.now()) - startedAt) / 1000))}s`
    : '0s';

  return (
    <GlobalModal
      title={`Smoke Runner: ${SMOKE_BOARD_ID}`}
      onClose={() => {
        cancelRef.current = true;
        onClose();
      }}
      className={MODAL_CLASS_NAME}
      bodyClassName={MODAL_BODY_CLASS_NAME}
    >
      <div className="inspect-card" style={SPLIT_LAYOUT_STYLE}>
        <div className="inspect-card__preview-pane" style={LEFT_PANE_STYLE}>
          <div style={TOOLBAR_STYLE}>
            <button
              type="button"
              className="btn btn-primary board-button"
              onClick={() => { void handleRun(); }}
              disabled={suiteStatus === 'running'}
              data-testid="smoke-runner-run-button"
            >
              Run
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary board-button"
              onClick={handleStop}
              disabled={suiteStatus !== 'running'}
              data-testid="smoke-runner-stop-button"
            >
              Stop
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary board-button"
              onClick={() => { void handleCopyReport(); }}
              disabled={logs.length === 0}
            >
              Copy Report
            </button>
            <div className="ms-auto global-modal__chip global-modal__chip--active" data-testid="smoke-runner-suite-status">
              {suiteStatus.toUpperCase()} · {durationText}
            </div>
          </div>

          <div className="global-modal__section">
            <div className="global-modal__section-title">Summary</div>
            <div className="global-modal__chips">
              {summaryChips.map((chip) => (
                <div
                  key={chip.label}
                  className={[
                    'global-modal__chip',
                    chip.variant === 'active' ? 'global-modal__chip--active' : '',
                    chip.variant === 'ok' ? 'global-modal__chip--ok' : '',
                    chip.variant === 'fail' ? 'global-modal__chip--fail' : '',
                  ].filter(Boolean).join(' ')}
                >
                  {chip.label}
                </div>
              ))}
            </div>
            {suiteError ? (
              <div className="global-modal__issues-list" style={{ paddingLeft: '1rem' }}>
                <div>{suiteError}</div>
              </div>
            ) : null}
          </div>

          <div className="global-modal__section">
            <div className="global-modal__section-title">Cases</div>
            <div style={{ display: 'grid', gap: '0.65rem' }}>
              {caseStates.map((entry) => {
                const isActive = activeCaseId === entry.id && suiteStatus === 'running';
                return (
                  <div key={entry.id} data-testid={`smoke-runner-case-${entry.id}`} style={{
                    ...CASE_ROW_STYLE,
                    borderColor: isActive
                      ? 'color-mix(in srgb, var(--color-accent-strong) 55%, var(--color-border-strong))'
                      : CASE_ROW_STYLE.border,
                  }}>
                    <div className="d-flex align-items-start justify-content-between gap-2 mb-2">
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--color-text)' }}>{entry.id}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-soft)' }}>{entry.title}</div>
                      </div>
                      <div
                        data-testid={`smoke-runner-case-status-${entry.id}`}
                        className={[
                        'global-modal__chip',
                        entry.status === 'running' ? 'global-modal__chip--active' : '',
                        entry.status === 'passed' ? 'global-modal__chip--ok' : '',
                        entry.status === 'failed' ? 'global-modal__chip--fail' : '',
                      ].filter(Boolean).join(' ')}>
                        {entry.status}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--color-text-soft)' }}>
                      {entry.detail || entry.reason || 'Waiting to run'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="inspect-card__sidebar" style={RIGHT_PANE_STYLE}>
          <div className="inspect-card__sidebar-pane inspect-card__sidebar-pane--top" style={PANEL_STYLE}>
            <div className="global-modal__section">
              <div className="global-modal__section-title">Target</div>
              <pre className="global-modal__pre" style={{ maxHeight: 'none' }}>{jsonText({
                boardId: SMOKE_BOARD_ID,
                serverOrigin: normalizedOrigin || '(missing)',
                transport: 'serverUrl',
              })}</pre>
            </div>
            <div className="global-modal__section">
              <div className="global-modal__section-title">Current</div>
              <pre
                className="global-modal__pre"
                style={{ maxHeight: '14rem' }}
                data-testid="smoke-runner-current-state"
              >{jsonText({
                activeCaseId: activeCaseId || null,
                suiteStatus,
                startedAt: startedAt ? new Date(startedAt).toISOString() : null,
                finishedAt: finishedAt ? new Date(finishedAt).toISOString() : null,
              })}</pre>
            </div>
            <div className="global-modal__section">
              <div className="global-modal__section-title">AI Responses</div>
              <div
                className="global-modal__pre"
                style={{ maxHeight: '14rem', display: 'grid', gap: '0.65rem' }}
                data-testid="smoke-runner-ai-responses"
              >{orderedAiResponses.length > 0
                ? orderedAiResponses.map((entry) => (
                  <div key={entry.caseId} style={{ display: 'grid', gap: '0.2rem' }}>
                    <div style={{ fontWeight: 700, color: 'var(--color-text)' }}>{entry.caseId}</div>
                    <div style={{ whiteSpace: 'pre-wrap', color: 'var(--color-text)' }}>
                      {entry.responseText}
                      {' '}
                      <span aria-label={entry.statusMark === '✓' ? 'response matched expected output' : 'response did not match expected output'}>{entry.statusMark}</span>
                      {entry.expectedLabel ? ` (Expected: ${entry.expectedLabel})` : ''}
                    </div>
                  </div>
                ))
                : 'No AI responses captured yet.'}</div>
            </div>
          </div>

          <div className="inspect-card__sidebar-pane inspect-card__sidebar-pane--bottom" style={PANEL_STYLE}>
            <div className="global-modal__section-title">Log</div>
            <pre
              className="global-modal__pre"
              style={{ height: '100%', maxHeight: 'none', minHeight: '12rem' }}
              data-testid="smoke-runner-log"
            >{logs.length > 0
              ? logs.map((entry) => `[${new Date(entry.at).toLocaleTimeString()}]${entry.caseId ? ` [${entry.caseId}]` : ''} ${entry.message}`).join('\n')
              : 'No smoke run started yet.'}</pre>
          </div>
        </div>
      </div>
    </GlobalModal>
  );
}