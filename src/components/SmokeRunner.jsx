import React, { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { GlobalModal } from './GlobalModal.jsx';
import { EMPTY_ARRAY, EMPTY_OBJECT } from '../lib/board-sse-state.js';
import { useBoardState } from '../hooks/useBoardState.js';
import { useCardState } from '../hooks/useCardState.js';
import { useChatActions, useChatWatchParty } from '../hooks/useChatState.js';
import { useManageBoards } from '../hooks/useManageBoards.js';
import { useRuntimeCards } from '../hooks/useRuntimeCards.js';
import { useCardChatViews } from '../hooks/useSseSlices.js';
import { initBoard } from '../lib/client.js';
import { compileRendererRules, resolveCardRenderer, resolvePaneFilters } from '../lib/cardPresentationConfig.js';
import { WATCHPARTY_AGENT_TOOL_ACTIONS } from '../../../shared/watchparty-agent-tools.js';

const SMOKE_BOARD_ID = 'live-test-frontend';
const PROBE_ENVELOPE = '__probe__echo__probe__';
const NON_PROBE_RESPONSE_TIMEOUT_MS = 120_000;

const T0_PORTFOLIO_CARD_ID = 'card-portfolio-t0-9000';
const T1_PORTFOLIO_CARD_ID = 'card-portfolio-t1-9001';
const T1_MARKET_PRICES_CARD_ID = 'market-prices-t1-9021';
const T1_PORTFOLIO_VALUE_CARD_ID = 'portfolio-value-t1-9041';
const T1_HOLDINGS_TOKEN = 'holdings_t1_9001';
const T1_QUOTES_TOKEN = 'quotes_t1_9021';
const PORTFOLIO_CARD_ID = 'card-portfolio-t2-9002';
const MARKET_PRICES_CARD_ID = 'market-prices-t2-9022';
const PORTFOLIO_VALUE_CARD_ID = 'portfolio-value-t2-9042';
const T2_HOLDINGS_TOKEN = 'holdings_t2_9002';
const T2_QUOTES_TOKEN = 'quotes_t2_9022';
const T3_CHAT_CARD_ID = 'card-portfolio-t3-9103';
const T3U_CHAT_CARD_ID = 'card-portfolio-t3u-9105';
const T4_CHAT_CARD_ID = 'card-portfolio-t4-9104';
const T8_CHAT_CARD_ID = 'card-portfolio-t8-9108';
const T9_CHAT_CARD_ID = 'card-portfolio-t9-9109';
const T8F_CHAT_CARD_ID = 'card-portfolio-t8f-9118';
const T9F_CHAT_CARD_ID = 'card-portfolio-t9f-9119';
const TR_PORTFOLIO_CARD_ID = 'card-portfolio-tr-9200';
const TR_MARKET_PRICES_CARD_ID = 'market-prices-tr-9201';
const TR_QUOTES_TOKEN = 'quotes_tr2_9201';
const TR_HOLDINGS_TOKEN = 'holdings_tr_9200';
const WARMUP_CHAT_CARD_ID = 'card-smoke-warmup-9099';
const AI_RESPONSE_CASE_ORDER = ['T3', 'T3u', 'T4', 'T8', 'T8F', 'T9', 'T9F'];
const STAGE_AI_RESPONSE_TOOL_NAME = 'liveboards.stage-ai-response-and-any-attachments';
const RUN_TESTS_PLACEHOLDER = 'MB1, T9, T9F';
const PORTFOLIO_CARD_VARIANTS = {
  [T0_PORTFOLIO_CARD_ID]: {
    caseLabel: 'T0',
  },
  [T1_PORTFOLIO_CARD_ID]: {
    caseLabel: 'T1',
    holdingsToken: T1_HOLDINGS_TOKEN,
  },
  [PORTFOLIO_CARD_ID]: {
    caseLabel: 'T2',
    holdingsToken: T2_HOLDINGS_TOKEN,
  },
  [T3_CHAT_CARD_ID]: {
    caseLabel: 'T3',
    holdingsToken: 'holdings_t3_9103',
  },
  [T3U_CHAT_CARD_ID]: {
    caseLabel: 'T3u',
    holdingsToken: 'holdings_t3u_9105',
  },
  [T4_CHAT_CARD_ID]: {
    caseLabel: 'T4',
    holdingsToken: 'holdings_t4_9104',
  },
  [T8_CHAT_CARD_ID]: {
    caseLabel: 'T8',
    holdingsToken: 'holdings_t8_9108',
  },
  [T9_CHAT_CARD_ID]: {
    caseLabel: 'T9',
    holdingsToken: 'holdings_t9_9109',
  },
  [T8F_CHAT_CARD_ID]: {
    caseLabel: 'T8F',
    holdingsToken: 'holdings_t8f_9118',
  },
  [T9F_CHAT_CARD_ID]: {
    caseLabel: 'T9F',
    holdingsToken: 'holdings_t9f_9119',
  },
  [TR_PORTFOLIO_CARD_ID]: {
    caseLabel: 'TR',
    holdingsToken: TR_HOLDINGS_TOKEN,
  },
  [WARMUP_CHAT_CARD_ID]: {
    caseLabel: 'W',
  },
};
const MARKET_PRICES_CARD_VARIANTS = {
  [T1_MARKET_PRICES_CARD_ID]: {
    caseLabel: 'T1',
    holdingsToken: T1_HOLDINGS_TOKEN,
    quotesToken: T1_QUOTES_TOKEN,
  },
  [MARKET_PRICES_CARD_ID]: {
    caseLabel: 'T2',
    holdingsToken: T2_HOLDINGS_TOKEN,
    quotesToken: T2_QUOTES_TOKEN,
  },
  [TR_MARKET_PRICES_CARD_ID]: {
    caseLabel: 'TR',
    holdingsToken: TR_HOLDINGS_TOKEN,
    quotesToken: TR_QUOTES_TOKEN,
  },
};
const PORTFOLIO_VALUE_CARD_VARIANTS = {
  [T1_PORTFOLIO_VALUE_CARD_ID]: {
    caseLabel: 'T1',
    holdingsToken: T1_HOLDINGS_TOKEN,
    quotesToken: T1_QUOTES_TOKEN,
  },
  [PORTFOLIO_VALUE_CARD_ID]: {
    caseLabel: 'T2',
    holdingsToken: T2_HOLDINGS_TOKEN,
    quotesToken: T2_QUOTES_TOKEN,
  },
};
const SMOKE_CARD_IDS = [
  T1_PORTFOLIO_VALUE_CARD_ID,
  T1_MARKET_PRICES_CARD_ID,
  T1_PORTFOLIO_CARD_ID,
  T0_PORTFOLIO_CARD_ID,
  TR_MARKET_PRICES_CARD_ID,
  TR_PORTFOLIO_CARD_ID,
  T9F_CHAT_CARD_ID,
  T8F_CHAT_CARD_ID,
  T9_CHAT_CARD_ID,
  T8_CHAT_CARD_ID,
  T3U_CHAT_CARD_ID,
  T3_CHAT_CARD_ID,
  T4_CHAT_CARD_ID,
  PORTFOLIO_VALUE_CARD_ID,
  MARKET_PRICES_CARD_ID,
  PORTFOLIO_CARD_ID,
  WARMUP_CHAT_CARD_ID,
];
const AI_RESPONSE_EXPECTATIONS = {
  T3: {
    expectedLabel: 'Echo: hi testing',
    matches: (responseText) => String(responseText || '').includes('Echo: hi testing'),
  },
  T3u: {
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

const TEST_SELECTOR_STYLE = {
  display: 'grid',
  gap: '0.55rem',
  minWidth: '100%',
  marginBottom: '0.85rem',
  padding: '0.8rem 0.9rem',
  border: '1px solid color-mix(in srgb, var(--color-border-strong) 75%, transparent)',
  borderRadius: '12px',
  background: 'color-mix(in srgb, var(--color-surface) 94%, transparent)',
};

const TEST_CHECKBOX_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(9.5rem, 1fr))',
  gap: '0.45rem 0.75rem',
};

const TEST_CHECKBOX_LABEL_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.45rem',
  fontSize: '0.78rem',
  color: 'var(--color-text)',
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
  { id: 'MB2', title: 'Resolver honors paneRules and cardRendererRules', mode: 'run' },
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
  { id: 'T3u', title: 'Probe chat lifecycle via real ChatPane UI', mode: 'run' },
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

const RUNNABLE_SMOKE_CASES = SMOKE_CASES.filter((entry) => entry.mode === 'run');

const SMOKE_CASE_IDS = new Set(SMOKE_CASES.map((entry) => entry.id));

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

function setTextAreaInputValue(element, value) {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

function applyCaseLabelToTitle(card, caseLabel, fallbackTitle) {
  if (!caseLabel) {
    return;
  }
  card.meta = {
    ...(card.meta && typeof card.meta === 'object' ? card.meta : {}),
    title: `${String(card.meta?.title || fallbackTitle).trim()} (${caseLabel})`,
  };
}

function buildPortfolioCard(cardId = PORTFOLIO_CARD_ID) {
  const card = cloneJson(BASE_PORTFOLIO_CARD);
  card.id = cardId;
  const variant = PORTFOLIO_CARD_VARIANTS[cardId];
  if (variant) {
    applyCaseLabelToTitle(card, variant.caseLabel, 'Portfolio');
    card.provides = Array.isArray(card.provides)
      ? card.provides.map((entry) => (entry?.bindTo === 'holdings_tc1' && variant.holdingsToken ? { ...entry, bindTo: variant.holdingsToken } : entry))
      : [];
  }
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

function buildMarketPricesCard(cardId = MARKET_PRICES_CARD_ID, quotesToken, holdingsToken) {
  const card = cloneJson(BASE_MARKET_PRICES_CARD);
  const variant = MARKET_PRICES_CARD_VARIANTS[cardId] || EMPTY_OBJECT;
  const resolvedQuotesToken = quotesToken || variant.quotesToken || 'quotes_tc2';
  const resolvedHoldingsToken = holdingsToken || variant.holdingsToken || 'holdings_tc1';
  card.id = cardId;
  applyCaseLabelToTitle(card, variant.caseLabel, 'Market Prices');
  card.requires = Array.isArray(card.requires)
    ? card.requires.map((entry) => (entry === 'holdings_tc1' ? resolvedHoldingsToken : entry))
    : [];
  card.provides = Array.isArray(card.provides)
    ? card.provides.map((entry) => (entry?.bindTo === 'quotes_tc2' ? { ...entry, bindTo: resolvedQuotesToken } : entry))
    : [];
  if (Array.isArray(card.source_defs)) {
    card.source_defs = card.source_defs.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return entry;
      }
      const nextEntry = entry?.bindTo === 'quotes_tc2' ? { ...entry, bindTo: resolvedQuotesToken } : { ...entry };
      if (nextEntry?.projections?.quote_urls) {
        nextEntry.projections = {
          ...nextEntry.projections,
          quote_urls: String(nextEntry.projections.quote_urls).replaceAll('holdings_tc1', resolvedHoldingsToken),
        };
      }
      return nextEntry;
    });
  }
  if (Array.isArray(card.compute)) {
    card.compute = card.compute.map((entry) => (
      entry?.expr
        ? { ...entry, expr: String(entry.expr).replaceAll('quotes_tc2', resolvedQuotesToken) }
        : entry
    ));
  }
  return card;
}

function buildPortfolioValueCard(cardId = PORTFOLIO_VALUE_CARD_ID, quotesToken, holdingsToken) {
  const card = cloneJson(BASE_PORTFOLIO_VALUE_CARD);
  const variant = PORTFOLIO_VALUE_CARD_VARIANTS[cardId] || EMPTY_OBJECT;
  const resolvedQuotesToken = quotesToken || variant.quotesToken || 'quotes_tc2';
  const resolvedHoldingsToken = holdingsToken || variant.holdingsToken || 'holdings_tc1';
  card.id = cardId;
  applyCaseLabelToTitle(card, variant.caseLabel, 'Portfolio Value');
  card.requires = [resolvedHoldingsToken, resolvedQuotesToken];
  card.compute[0].expr = card.compute[0].expr
    .replaceAll('holdings_tc1', resolvedHoldingsToken)
    .replaceAll('quotes_tc2', resolvedQuotesToken);
  return card;
}

function readLatestAssistantText(messages) {
  const latestAssistant = [...(Array.isArray(messages) ? messages : EMPTY_ARRAY)]
    .reverse()
    .find((message) => message?.role === 'assistant' && String(message?.text || '').trim());
  return latestAssistant ? String(latestAssistant.text || '').trim() : '';
}

function buildAttachmentMetadataSnapshot(file) {
  if (!file || typeof file !== 'object') {
    return null;
  }
  return {
    stored_name: String(file?.stored_name || ''),
    name: String(file?.name || ''),
    chat: file?.chat === true,
    hasPath: Object.prototype.hasOwnProperty.call(file, 'path'),
    keys: Object.keys(file).sort(),
  };
}

function buildChatTurnSnapshot(messages) {
  return (Array.isArray(messages) ? messages : EMPTY_ARRAY).map((message) => ({
    role: String(message?.role || ''),
    text: String(message?.text || ''),
    turn: String(message?.turn || ''),
  }));
}

function countNonEmptyLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .length;
}

function createSmokeAssertionError(message, comparison) {
  const error = new Error(message);
  error.smokeComparison = comparison;
  return error;
}

function readSmokeComparison(error) {
  return error && typeof error === 'object' && error.smokeComparison && typeof error.smokeComparison === 'object'
    ? error.smokeComparison
    : null;
}

function createInitialCaseState(entries = SMOKE_CASES) {
  return entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    mode: entry.mode,
    reason: entry.reason || '',
    status: entry.mode === 'skip' ? 'skipped' : 'pending',
    detail: entry.mode === 'skip' ? (entry.reason || 'Skipped.') : '',
    comparison: null,
    startedAt: 0,
    finishedAt: 0,
  }));
}

function parseRequestedSmokeCaseIds(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
}

function resolveSelectedSmokeCases(value) {
  const requestedIds = parseRequestedSmokeCaseIds(value);
  const unknownIds = requestedIds.filter((caseId) => !SMOKE_CASE_IDS.has(caseId));
  if (requestedIds.length === 0) {
    return {
      requestedIds,
      unknownIds,
      selectedCases: SMOKE_CASES,
    };
  }

  const requestedIdSet = new Set(requestedIds);
  return {
    requestedIds,
    unknownIds,
    selectedCases: SMOKE_CASES.filter((entry) => requestedIdSet.has(entry.id)),
  };
}

function formatSelectedSmokeCaseIds(caseIds) {
  const normalizedIds = RUNNABLE_SMOKE_CASES
    .map((entry) => entry.id)
    .filter((caseId) => caseIds.has(caseId));
  if (normalizedIds.length === RUNNABLE_SMOKE_CASES.length) {
    return '';
  }
  return normalizedIds.join(', ');
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
  const [runTestsText, setRunTestsText] = useState('');
  const board = useBoardState(SMOKE_BOARD_ID);
  const t1PortfolioCardHook = useCardState(SMOKE_BOARD_ID, T1_PORTFOLIO_CARD_ID);
  const portfolioCardHook = useCardState(SMOKE_BOARD_ID, PORTFOLIO_CARD_ID);
  const marketPricesCardHook = useCardState(SMOKE_BOARD_ID, MARKET_PRICES_CARD_ID);
  const portfolioValueCardHook = useCardState(SMOKE_BOARD_ID, PORTFOLIO_VALUE_CARD_ID);
  const t3CardHook = useCardState(SMOKE_BOARD_ID, T3_CHAT_CARD_ID);
  const t3uCardHook = useCardState(SMOKE_BOARD_ID, T3U_CHAT_CARD_ID);
  const t4CardHook = useCardState(SMOKE_BOARD_ID, T4_CHAT_CARD_ID);
  const t8CardHook = useCardState(SMOKE_BOARD_ID, T8_CHAT_CARD_ID);
  const t9CardHook = useCardState(SMOKE_BOARD_ID, T9_CHAT_CARD_ID);
  const t8fCardHook = useCardState(SMOKE_BOARD_ID, T8F_CHAT_CARD_ID);
  const t9fCardHook = useCardState(SMOKE_BOARD_ID, T9F_CHAT_CARD_ID);
  const trPortfolioCardHook = useCardState(SMOKE_BOARD_ID, TR_PORTFOLIO_CARD_ID);
  const trMarketPricesCardHook = useCardState(SMOKE_BOARD_ID, TR_MARKET_PRICES_CARD_ID);
  const warmupCardHook = useCardState(SMOKE_BOARD_ID, WARMUP_CHAT_CARD_ID);
  const t3ChatActions = useChatActions(SMOKE_BOARD_ID, T3_CHAT_CARD_ID);
  const t3uChatActions = useChatActions(SMOKE_BOARD_ID, T3U_CHAT_CARD_ID);
  const portfolioChatActions = useChatActions(SMOKE_BOARD_ID, PORTFOLIO_CARD_ID);
  const t4ChatActions = useChatActions(SMOKE_BOARD_ID, T4_CHAT_CARD_ID);
  const t8ChatActions = useChatActions(SMOKE_BOARD_ID, T8_CHAT_CARD_ID);
  const t9ChatActions = useChatActions(SMOKE_BOARD_ID, T9_CHAT_CARD_ID);
  const t8fChatActions = useChatActions(SMOKE_BOARD_ID, T8F_CHAT_CARD_ID);
  const t9fChatActions = useChatActions(SMOKE_BOARD_ID, T9F_CHAT_CARD_ID);
  const warmupChatActions = useChatActions(SMOKE_BOARD_ID, WARMUP_CHAT_CARD_ID);
  const { manageBoardsActions } = useManageBoards(normalizedOrigin, { enabled: false });
  const { runtimeCardActions } = useRuntimeCards(SMOKE_BOARD_ID);
  const t3ChatView = useCardChatViews(SMOKE_BOARD_ID, T3_CHAT_CARD_ID);
  const t3uChatView = useCardChatViews(SMOKE_BOARD_ID, T3U_CHAT_CARD_ID);
  const portfolioChatView = useCardChatViews(SMOKE_BOARD_ID, PORTFOLIO_CARD_ID);
  const t4ChatView = useCardChatViews(SMOKE_BOARD_ID, T4_CHAT_CARD_ID);
  const t8ChatView = useCardChatViews(SMOKE_BOARD_ID, T8_CHAT_CARD_ID);
  const t9ChatView = useCardChatViews(SMOKE_BOARD_ID, T9_CHAT_CARD_ID);
  const t8fChatView = useCardChatViews(SMOKE_BOARD_ID, T8F_CHAT_CARD_ID);
  const t9fChatView = useCardChatViews(SMOKE_BOARD_ID, T9F_CHAT_CARD_ID);
  const warmupChatView = useCardChatViews(SMOKE_BOARD_ID, WARMUP_CHAT_CARD_ID);
  const t3WatchParty = useChatWatchParty(SMOKE_BOARD_ID, T3_CHAT_CARD_ID);
  const t3uWatchParty = useChatWatchParty(SMOKE_BOARD_ID, T3U_CHAT_CARD_ID);
  const portfolioWatchParty = useChatWatchParty(SMOKE_BOARD_ID, PORTFOLIO_CARD_ID);
  const t4WatchParty = useChatWatchParty(SMOKE_BOARD_ID, T4_CHAT_CARD_ID);
  const t8WatchParty = useChatWatchParty(SMOKE_BOARD_ID, T8_CHAT_CARD_ID);
  const t9WatchParty = useChatWatchParty(SMOKE_BOARD_ID, T9_CHAT_CARD_ID);
  const t8fWatchParty = useChatWatchParty(SMOKE_BOARD_ID, T8F_CHAT_CARD_ID);
  const t9fWatchParty = useChatWatchParty(SMOKE_BOARD_ID, T9F_CHAT_CARD_ID);
  const [suiteStatus, setSuiteStatus] = useState('idle');
  const [suiteError, setSuiteError] = useState('');
  const [activeCaseId, setActiveCaseId] = useState('');
  const selectedCaseResolution = useMemo(() => resolveSelectedSmokeCases(runTestsText), [runTestsText]);
  const selectedSmokeCases = selectedCaseResolution.selectedCases;
  const selectedSmokeCaseIds = useMemo(() => new Set(selectedSmokeCases.map((entry) => entry.id)), [selectedSmokeCases]);
  const selectedRunnableCaseIds = useMemo(() => (
    selectedCaseResolution.requestedIds.length === 0
      ? new Set(RUNNABLE_SMOKE_CASES.map((entry) => entry.id))
      : new Set(selectedSmokeCases.filter((entry) => entry.mode === 'run').map((entry) => entry.id))
  ), [selectedCaseResolution, selectedSmokeCases]);
  const [caseStates, setCaseStates] = useState(() => createInitialCaseState(selectedSmokeCases));
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
    [T1_PORTFOLIO_CARD_ID]: buildObservedCardState(board, T1_PORTFOLIO_CARD_ID),
    [T1_MARKET_PRICES_CARD_ID]: buildObservedCardState(board, T1_MARKET_PRICES_CARD_ID),
    [T1_PORTFOLIO_VALUE_CARD_ID]: buildObservedCardState(board, T1_PORTFOLIO_VALUE_CARD_ID),
    [PORTFOLIO_CARD_ID]: buildObservedCardState(board, PORTFOLIO_CARD_ID),
    [MARKET_PRICES_CARD_ID]: buildObservedCardState(board, MARKET_PRICES_CARD_ID),
    [PORTFOLIO_VALUE_CARD_ID]: buildObservedCardState(board, PORTFOLIO_VALUE_CARD_ID),
    [T3_CHAT_CARD_ID]: buildObservedCardState(board, T3_CHAT_CARD_ID),
    [T3U_CHAT_CARD_ID]: buildObservedCardState(board, T3U_CHAT_CARD_ID),
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
    [T3_CHAT_CARD_ID]: t3ChatView?.chatState ?? null,
    [T3U_CHAT_CARD_ID]: t3uChatView?.chatState ?? null,
    [T4_CHAT_CARD_ID]: t4ChatView?.chatState ?? null,
    [T8_CHAT_CARD_ID]: t8ChatView?.chatState ?? null,
    [T9_CHAT_CARD_ID]: t9ChatView?.chatState ?? null,
    [T8F_CHAT_CARD_ID]: t8fChatView?.chatState ?? null,
    [T9F_CHAT_CARD_ID]: t9fChatView?.chatState ?? null,
    [WARMUP_CHAT_CARD_ID]: warmupChatView?.chatState ?? null,
  }), [portfolioChatView, t3ChatView, t3uChatView, t4ChatView, t8ChatView, t8fChatView, t9ChatView, t9fChatView, warmupChatView]);
  const cardStatesRef = useRef(cardStatesById);
  const chatStatesRef = useRef(chatStatesById);
  const watchPartyByIdRef = useRef({});

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
      [T1_PORTFOLIO_CARD_ID]: t1PortfolioCardHook?.cardActions ?? null,
      [PORTFOLIO_CARD_ID]: portfolioCardHook?.cardActions ?? null,
      [MARKET_PRICES_CARD_ID]: marketPricesCardHook?.cardActions ?? null,
      [PORTFOLIO_VALUE_CARD_ID]: portfolioValueCardHook?.cardActions ?? null,
      [T3_CHAT_CARD_ID]: t3CardHook?.cardActions ?? null,
      [T3U_CHAT_CARD_ID]: t3uCardHook?.cardActions ?? null,
      [T4_CHAT_CARD_ID]: t4CardHook?.cardActions ?? null,
      [T8_CHAT_CARD_ID]: t8CardHook?.cardActions ?? null,
      [T9_CHAT_CARD_ID]: t9CardHook?.cardActions ?? null,
      [T8F_CHAT_CARD_ID]: t8fCardHook?.cardActions ?? null,
      [T9F_CHAT_CARD_ID]: t9fCardHook?.cardActions ?? null,
      [TR_PORTFOLIO_CARD_ID]: trPortfolioCardHook?.cardActions ?? null,
      [TR_MARKET_PRICES_CARD_ID]: trMarketPricesCardHook?.cardActions ?? null,
      [WARMUP_CHAT_CARD_ID]: warmupCardHook?.cardActions ?? null,
    };
  }, [marketPricesCardHook, portfolioCardHook, portfolioValueCardHook, t1PortfolioCardHook, t3CardHook, t3uCardHook, t4CardHook, t8CardHook, t8fCardHook, t9CardHook, t9fCardHook, trMarketPricesCardHook, trPortfolioCardHook, warmupCardHook]);

  useEffect(() => {
    chatActionsRef.current = {
      [PORTFOLIO_CARD_ID]: portfolioChatActions,
      [T3_CHAT_CARD_ID]: t3ChatActions,
      [T3U_CHAT_CARD_ID]: t3uChatActions,
      [T4_CHAT_CARD_ID]: t4ChatActions,
      [T8_CHAT_CARD_ID]: t8ChatActions,
      [T9_CHAT_CARD_ID]: t9ChatActions,
      [T8F_CHAT_CARD_ID]: t8fChatActions,
      [T9F_CHAT_CARD_ID]: t9fChatActions,
      [WARMUP_CHAT_CARD_ID]: warmupChatActions,
    };
  }, [portfolioChatActions, t3ChatActions, t3uChatActions, t4ChatActions, t8ChatActions, t8fChatActions, t9ChatActions, t9fChatActions, warmupChatActions]);

  useEffect(() => {
    chatStatesRef.current = chatStatesById;
  }, [chatStatesById]);

  useEffect(() => {
    watchPartyByIdRef.current = {
      [PORTFOLIO_CARD_ID]: portfolioWatchParty ?? null,
      [T3_CHAT_CARD_ID]: t3WatchParty ?? null,
      [T3U_CHAT_CARD_ID]: t3uWatchParty ?? null,
      [T4_CHAT_CARD_ID]: t4WatchParty ?? null,
      [T8_CHAT_CARD_ID]: t8WatchParty ?? null,
      [T9_CHAT_CARD_ID]: t9WatchParty ?? null,
      [T8F_CHAT_CARD_ID]: t8fWatchParty ?? null,
      [T9F_CHAT_CARD_ID]: t9fWatchParty ?? null,
    };
  }, [portfolioWatchParty, t3WatchParty, t3uWatchParty, t4WatchParty, t8WatchParty, t9WatchParty, t8fWatchParty, t9fWatchParty]);

  const appendLog = useCallback((caseId, message, kind = 'info') => {
    const entry = createLogEntry(caseId, message, kind);
    startTransition(() => {
      setLogs((current) => [...current, entry]);
      if (caseId) {
        setCaseStates((current) => current.map((entryState) => (
          entryState.id === caseId
            ? { ...entryState, detail: message }
            : entryState
        )));
      }
    });
  }, []);

  const recordAiResponse = useCallback((caseId, responseText) => {
    const normalizedCaseId = String(caseId || '').trim();
    if (!normalizedCaseId) return;
    const normalizedResponseText = String(responseText || '').trim();
    if (!normalizedResponseText) return;
    runtimeRef.current.aiResponsesByCaseId.set(normalizedCaseId, normalizedResponseText);
    startTransition(() => {
      setAiResponses((current) => (
        current[normalizedCaseId] === normalizedResponseText
          ? current
          : { ...current, [normalizedCaseId]: normalizedResponseText }
      ));
    });
  }, []);

  const appendAiResponseSummary = useCallback(() => {
    const responseEntries = ['T3', 'T4', 'T8', 'T8F', 'T9', 'T9F']
      .filter((caseId) => selectedSmokeCaseIds.has(caseId))
      .map((caseId) => [caseId, runtimeRef.current.aiResponsesByCaseId.get(caseId) || ''])
      .filter(([, responseText]) => responseText);
    if (responseEntries.length === 0) {
      return;
    }
    appendLog('', 'AI response summary:');
    for (const [caseId, responseText] of responseEntries) {
      appendLog('', `${caseId}: ${responseText}`);
    }
  }, [appendLog, selectedSmokeCaseIds]);

  const markCase = useCallback((caseId, patch) => {
    startTransition(() => {
      setCaseStates((current) => current.map((entry) => (entry.id === caseId ? { ...entry, ...patch } : entry)));
    });
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
      return await getCardActions(T1_PORTFOLIO_CARD_ID).discoverSourceKinds();
    }
    if (tool === 'preflight.validate-candidate-card-definition') {
      return await getCardActions(T1_PORTFOLIO_CARD_ID).validateCandidateCardDefinition(args.candidate_card_content);
    }
    if (tool === 'preflight.probe-single-source-in-candidate-card') {
      return await getCardActions(T1_PORTFOLIO_CARD_ID).probeSingleSourceInCandidateCard(
        args.candidate_card_content,
        args.source_idx,
        {
          ...(args.mock_requires ? { mockRequires: args.mock_requires } : {}),
          ...(args.mock_projections ? { mockProjections: args.mock_projections } : {}),
        },
      );
    }
    if (tool === 'preflight.run-single-source-in-candidate-card') {
      return await getCardActions(T1_PORTFOLIO_CARD_ID).runSingleSourceInCandidateCard(
        args.candidate_card_content,
        args.source_idx,
        {
          ...(args.mock_requires ? { mockRequires: args.mock_requires } : {}),
          ...(args.mock_projections ? { mockProjections: args.mock_projections } : {}),
        },
      );
    }
    if (tool === 'preflight.run-one-cycle-with-candidate-card') {
      return await getCardActions(T1_PORTFOLIO_CARD_ID).runOneCycleWithCandidateCard(
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
      pageTitle: runtime.boardId,
      pageSubtitle: 'Smoke Runner board',
      ai: 'copilot',
      aiWorkspaceTemplate: 'default',
      uiTemplate: 'default',
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

  const readWatchParty = useCallback((cardId) => {
    return watchPartyByIdRef.current[cardId] ?? null;
  }, []);

  const waitForStageAiResponseWatchParty = useCallback(async (caseId, cardId, timeoutMs = 30_000) => {
    try {
      await waitUntil(() => {
        const watchParty = readWatchParty(cardId);
        const agentToolPayloads = Array.isArray(watchParty?.agentToolPayloads) ? watchParty.agentToolPayloads : [];
        return agentToolPayloads.some((payload) => (
          payload?.tool === STAGE_AI_RESPONSE_TOOL_NAME
          && payload?.action === WATCHPARTY_AGENT_TOOL_ACTIONS.INVOKING
        ))
          ? { watchParty, agentToolPayloads }
          : false;
      }, timeoutMs, `${caseId} watchparty stage-ai-response tool for ${cardId}`);
    } catch {
      const watchParty = readWatchParty(cardId);
      throw createSmokeAssertionError(`${caseId} watchparty missing stage-ai-response invocation for ${cardId}`, {
        expected: {
          tool: STAGE_AI_RESPONSE_TOOL_NAME,
          action: WATCHPARTY_AGENT_TOOL_ACTIONS.INVOKING,
        },
        found: {
          agentToolPayloads: Array.isArray(watchParty?.agentToolPayloads) ? watchParty.agentToolPayloads : [],
          agentTools: String(watchParty?.agentTools || ''),
        },
      });
    }
  }, [readWatchParty, waitUntil]);

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
    const cardState = buildObservedCardState(boardRef.current, cardId);
    return cardState?.cardContent ? cardState : false;
  }, timeoutMs, label), [waitUntil]);

  const waitForStoredCardFile = useCallback(async (cardId, storedName, label, timeoutMs = 15_000) => waitUntil(() => {
    const cardState = cardStatesRef.current[cardId];
    if (!cardState?.cardContent) {
      return false;
    }
    const files = Array.isArray(cardState?.cardData?.files) ? cardState.cardData.files : EMPTY_ARRAY;
    const file = files.find((entry) => String(entry?.stored_name || '') === String(storedName || ''));
    return file ? { cardState, files, file } : false;
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

  const openChatComposerViaUi = useCallback(async (cardId, labelPrefix = cardId, timeoutMs = 15_000) => {
    const openButton = await waitUntil(() => {
      const element = document.querySelector(`[data-testid="card-shell-open-chat-${cardId}"]`);
      return element instanceof HTMLButtonElement ? element : false;
    }, timeoutMs, `${labelPrefix} open chat button`);
    openButton.click();
    return await waitUntil(() => {
      const modal = document.querySelector(`[data-testid="chat-modal-${cardId}"]`);
      const textarea = document.querySelector(`[data-testid="chat-pane-textarea-${cardId}"]`);
      const sendButton = document.querySelector(`[data-testid="chat-pane-send-${cardId}"]`);
      return textarea instanceof HTMLTextAreaElement && sendButton instanceof HTMLButtonElement
        ? {
            modal: modal instanceof HTMLElement ? modal : null,
            textarea,
            sendButton,
          }
        : false;
    }, timeoutMs, `${labelPrefix} chat composer ready`);
  }, [waitUntil]);

  const sendChatThroughUi = useCallback(async (cardId, text, labelPrefix = cardId, timeoutMs = 15_000) => {
    const composer = await openChatComposerViaUi(cardId, labelPrefix, timeoutMs);
    setTextAreaInputValue(composer.textarea, text);
    const sendButton = await waitUntil(() => {
      const element = document.querySelector(`[data-testid="chat-pane-send-${cardId}"]`);
      return element instanceof HTMLButtonElement && !element.disabled ? element : false;
    }, timeoutMs, `${labelPrefix} send button enabled`);
    sendButton.click();
    return composer;
  }, [openChatComposerViaUi, waitUntil]);

  const waitForWorkingBubbleVisible = useCallback(async (cardId, labelPrefix = cardId, timeoutMs = 15_000) => waitUntil(() => {
    const element = document.querySelector(`[data-testid="chat-working-bubble-${cardId}"]`);
    return element instanceof HTMLElement ? element : false;
  }, timeoutMs, `${labelPrefix} working bubble visible`), [waitUntil]);

  const closeChatModalViaUi = useCallback(async (cardId) => {
    const modal = document.querySelector(`[data-testid="chat-modal-${cardId}"]`);
    if (!(modal instanceof HTMLElement)) {
      const textarea = document.querySelector(`[data-testid="chat-pane-textarea-${cardId}"]`);
      const openButton = document.querySelector(`[data-testid="card-shell-open-chat-${cardId}"]`);
      if (textarea instanceof HTMLTextAreaElement && openButton instanceof HTMLButtonElement) {
        openButton.click();
      }
      return;
    }
    const closeButton = modal.querySelector('.board-icon-button');
    if (closeButton instanceof HTMLButtonElement) {
      closeButton.click();
    }
  }, []);

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
      throw createSmokeAssertionError(`warmup probe final reply not found for turn ${turnId}`, {
        expected: {
          assistantReplyIncludes: `Echo: ${promptText}`,
        },
        found: {
          latestAssistantReply: readLatestAssistantText(assistantPoll.messages),
          turnMessages: buildChatTurnSnapshot(assistantPoll.messages),
        },
      });
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

  const removeCardsBestEffort = useCallback(async (cardIds, phase = 'cleanup') => {
    for (const cardId of cardIds) {
      try {
        await callMcp('manage.remove-card', { card_id: cardId });
        appendLog('', `[${phase}] removed ${cardId}`);
      } catch (error) {
        appendLog('', `[${phase}] remove-card failed for ${cardId}: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    }
  }, [appendLog, callMcp]);

  const clearSmokeCardsAtStart = useCallback(async (trackedCardIds = EMPTY_ARRAY) => {
    const ids = [...new Set([...trackedCardIds, ...SMOKE_CARD_IDS])];
    if (ids.length === 0) {
      return;
    }
    const availableCardIds = new Set(Object.keys(boardRef.current?.cardContents ?? EMPTY_OBJECT));
    const removableIds = ids.filter((cardId) => availableCardIds.has(cardId));
    const skippedIds = ids.filter((cardId) => !availableCardIds.has(cardId));

    appendLog('', `[preflight] board state reports ${availableCardIds.size} available card(s)`);
    if (skippedIds.length > 0) {
      for (const cardId of skippedIds) {
        appendLog('', `[preflight] skip remove for ${cardId}: card not present in board state`);
      }
    }
    if (removableIds.length === 0) {
      return;
    }
    appendLog('', `[preflight] removing ${removableIds.length} smoke card(s) before start`);
    await removeCardsBestEffort(removableIds, 'preflight');
  }, [appendLog, removeCardsBestEffort]);

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
    resetSseState();
  }, [appendLog, closeBoardSse, resetSseState, unsubscribeCardChats]);

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

    if (caseId === 'MB2') {
      const uiConfig = {
        paneRules: [
          { pane: 'gandalf', when: 'meta.gandalf = true' },
          { pane: 'truthset', when: 'meta.truthset = true' },
        ],
        cardRendererRules: [
          { renderer: 'strategist', when: 'meta.card_renderer = "strategist"' },
          { renderer: 'ingest', when: 'meta.card_renderer = "ingest"' },
          { renderer: 'postbox', when: 'meta.card_renderer = "postbox"' },
        ],
      };
      const strategistCardState = {
        cardContent: {
          meta: {
            gandalf: true,
            card_renderer: 'strategist',
          },
        },
      };
      const postboxCardState = {
        cardContent: {
          meta: {
            gandalf: true,
            card_renderer: 'postbox',
          },
        },
      };
      const ingestCardState = {
        cardContent: {
          meta: {
            gandalf: true,
            card_renderer: 'ingest',
          },
        },
      };
      const truthsetCardState = {
        cardContent: {
          meta: {
            truthset: true,
          },
        },
      };
      const plainCardState = {
        cardContent: {
          meta: {},
        },
      };

      const gandalfPaneFilters = resolvePaneFilters(uiConfig, 'gandalf');
      const truthsetPaneFilters = resolvePaneFilters(uiConfig, 'truthset');
      const rendererRules = compileRendererRules(uiConfig);

      if (gandalfPaneFilters.length !== 1) {
        throw new Error(`expected exactly one gandalf paneRules rule, found ${gandalfPaneFilters.length}`);
      }
      if (truthsetPaneFilters.length !== 1) {
        throw new Error(`expected exactly one truthset paneRules rule, found ${truthsetPaneFilters.length}`);
      }
      if (gandalfPaneFilters[0](strategistCardState) !== true || gandalfPaneFilters[0](truthsetCardState) !== false) {
        throw new Error('paneRules gandalf rule did not match the expected card states');
      }
      if (truthsetPaneFilters[0](truthsetCardState) !== true || truthsetPaneFilters[0](strategistCardState) !== false) {
        throw new Error('paneRules truthset rule did not match the expected card states');
      }

      const strategistRenderer = resolveCardRenderer(strategistCardState, rendererRules);
      const ingestRenderer = resolveCardRenderer(ingestCardState, rendererRules);
      const postboxRenderer = resolveCardRenderer(postboxCardState, rendererRules);
      const plainRenderer = resolveCardRenderer(plainCardState, rendererRules);

      if (strategistRenderer !== 'strategist') {
        throw new Error(`expected strategist renderer, found ${strategistRenderer}`);
      }
      if (ingestRenderer !== 'ingest') {
        throw new Error(`expected ingest renderer, found ${ingestRenderer}`);
      }
      if (postboxRenderer !== 'postbox') {
        throw new Error(`expected postbox renderer, found ${postboxRenderer}`);
      }
      if (plainRenderer !== 'default') {
        throw new Error(`expected default renderer fallback, found ${plainRenderer}`);
      }

      log('paneRules and cardRendererRules resolver checks passed');
      return;
    }

    if (caseId === 'T0') {
      log(`upserting ${T0_PORTFOLIO_CARD_ID}`);
      await callMcp('manage.upsert-card', { card_id: T0_PORTFOLIO_CARD_ID, candidate_card_content: buildPortfolioCard(T0_PORTFOLIO_CARD_ID) });
      recordCard(T0_PORTFOLIO_CARD_ID);
      const stored = await waitForCardStateData(T0_PORTFOLIO_CARD_ID, `hook card state for ${T0_PORTFOLIO_CARD_ID}`);
      const expected = buildPortfolioCard(T0_PORTFOLIO_CARD_ID);
      const storedCard = {
        ...stored.cardContent,
        card_data: stored.cardData,
      };
      if (jsonText(canonicalizeJson(storedCard)) !== jsonText(canonicalizeJson(expected))) {
        throw new Error(`hook card state mismatch for ${T0_PORTFOLIO_CARD_ID}`);
      }
      const poll = await pollBoardStatus((statusData) => {
        const card = findBoardStatusCard(statusData, T0_PORTFOLIO_CARD_ID);
        return card && String(card.status || '') === 'completed';
      }, `${T0_PORTFOLIO_CARD_ID} to complete`, 6, 1_000);
      if (!poll.matched) throw new Error(`timed out waiting for ${T0_PORTFOLIO_CARD_ID} to reach completed`);
      log(`${T0_PORTFOLIO_CARD_ID} completed in ${poll.attemptsUsed} poll(s)`);
      return;
    }

    if (caseId === 'T1') {
      log('discover.source-kinds');
      const sourceKinds = await callMcp('discover.source-kinds', {});
      if (!sourceKinds?.sourceKinds || Object.keys(sourceKinds.sourceKinds).length === 0) {
        throw new Error(`discover.source-kinds returned no source kinds: ${jsonText(sourceKinds)}`);
      }
      log(`discover.source-kinds ok: ${Object.keys(sourceKinds.sourceKinds).length} kind(s)`);

      await callMcp('manage.upsert-card', {
        card_id: T1_PORTFOLIO_CARD_ID,
        candidate_card_content: buildPortfolioCard(T1_PORTFOLIO_CARD_ID),
      });
      recordCard(T1_PORTFOLIO_CARD_ID);

      const marketPricesCard = buildMarketPricesCard(T1_MARKET_PRICES_CARD_ID);
      const portfolioValueCard = buildPortfolioValueCard(T1_PORTFOLIO_VALUE_CARD_ID);

      const marketPricesPreflight = await callMcp('preflight.validate-candidate-card-definition', {
        candidate_card_content: marketPricesCard,
      });
      if (marketPricesPreflight?.cardId !== T1_MARKET_PRICES_CARD_ID || marketPricesPreflight?.isValid !== true) {
        throw new Error(`market-prices candidate preflight failed: ${jsonText(marketPricesPreflight)}`);
      }
      log('market-prices candidate preflight passed');

      const storedPortfolio = await waitForCardStateData(T1_PORTFOLIO_CARD_ID, `hook card state for ${T1_PORTFOLIO_CARD_ID}`);
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
      if (sourceProbe?.bindTo !== T1_QUOTES_TOKEN || sourceProbe?.reachable !== true) {
        throw new Error(`market-prices source probe failed: ${jsonText(sourceProbe)}`);
      }
      log('market-prices source probe passed');

      const sourceRun = await callMcp('preflight.run-single-source-in-candidate-card', {
        candidate_card_content: marketPricesCard,
        source_idx: 0,
        mock_projections: mockProjections,
      });
      if (sourceRun?.bindTo !== T1_QUOTES_TOKEN || sourceRun?.ok !== true) {
        throw new Error(`market-prices source run failed: ${jsonText(sourceRun)}`);
      }
      log('market-prices source run passed');

      const cycle = await callMcp('preflight.run-one-cycle-with-candidate-card', {
        candidate_card_content: marketPricesCard,
        mock_requires: { [T1_HOLDINGS_TOKEN]: holdings },
      });
      if (cycle?.cardId !== T1_MARKET_PRICES_CARD_ID || cycle?.ok !== true || !cycle?.provides_outputs?.[T1_QUOTES_TOKEN]?.quoteResponse) {
        throw new Error(`market-prices cycle preflight failed: ${jsonText(cycle)}`);
      }
      log('market-prices one-cycle preflight passed');

      const portfolioValuePreflight = await callMcp('preflight.validate-candidate-card-definition', {
        candidate_card_content: portfolioValueCard,
      });
      if (portfolioValuePreflight?.cardId !== T1_PORTFOLIO_VALUE_CARD_ID || portfolioValuePreflight?.isValid !== true) {
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
      const computePayload = await waitUntil(() => {
        const currentBoard = boardRef.current;
        const marketRuntime = buildObservedCardState(currentBoard, MARKET_PRICES_CARD_ID);
        const portfolioRuntime = buildObservedCardState(currentBoard, PORTFOLIO_VALUE_CARD_ID);
        const holdings = storedPortfolio?.cardData?.holdings;
        const priceRows = portfolioRuntime?.requiresDataObjects?.quotes_tc2?.quoteResponse?.result
          || marketRuntime?.requiresDataObjects?.quotes_tc2?.quoteResponse?.result
          || marketRuntime?.cardRuntime?.computed_values?.normalizedQuotes?.quoteResponse?.result
          || marketRuntime?.cardRuntime?.computed_values?.prices
          || EMPTY_ARRAY;
        const positions = portfolioRuntime?.cardRuntime?.computed_values?.positions;
        const totalValue = Number(portfolioRuntime?.cardRuntime?.computed_values?.totalValue);
        return Array.isArray(holdings) && Array.isArray(priceRows) && Array.isArray(positions) && Number.isFinite(totalValue)
          ? { holdings, priceRows, positions, totalValue }
          : false;
      }, 30_000, `computed runtime payload for ${PORTFOLIO_VALUE_CARD_ID}`);
      const { holdings, priceRows, positions, totalValue } = computePayload;
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
      log(`step 0/7: upserting ${T3_CHAT_CARD_ID} for chat`);
      await callMcp('manage.upsert-card', {
        card_id: T3_CHAT_CARD_ID,
        candidate_card_content: buildPortfolioCard(T3_CHAT_CARD_ID),
      });
      recordCard(T3_CHAT_CARD_ID);
      await ensureBoardSseConnection();
      await subscribeCardChats(T3_CHAT_CARD_ID);

      const turnId = makeTurnId();
      const promptText = 'hi testing';
      const probeText = buildProbeChatText(promptText, 'echo');

      log(`step 1/7: sending chat turn ${turnId}`);
      await callAction('chat-send', T3_CHAT_CARD_ID, {
        text: probeText,
        probe: 'echo',
        'turn-id': turnId,
      });

      log(`step 2/7: verifying user chat entry is stored`);
      const userPoll = await pollChatMessages(T3_CHAT_CARD_ID, turnId, (messages) => messages.some((message) => message?.role === 'user' && String(message?.text || '') === promptText), `user chat message for turn ${turnId}`, 8, 500);
      if (!userPoll.matched) throw new Error(`user message not found for prompt ${promptText}`);

      log(`step 3/7: verifying chat processing turns on`);
      const onPoll = await pollChatProcessing(T3_CHAT_CARD_ID, true, `chat processing on for ${T3_CHAT_CARD_ID}`, 8, 1_000);
      if (!onPoll.matched) throw new Error(`chat processing did not turn on for ${T3_CHAT_CARD_ID}`);

      const expectedReply = `Echo: ${promptText}`;
      log(`step 4/7: waiting for probe final reply`);
      const assistantPoll = await pollChatMessages(T3_CHAT_CARD_ID, turnId, (messages) => messages.some((message) => message?.role === 'assistant' && String(message?.text || '').includes(expectedReply)), `probe final reply for turn ${turnId}`, 16, 1_000);
      if (!assistantPoll.matched) {
        recordAiResponse('T3', readLatestAssistantText(assistantPoll.messages));
        throw new Error(`probe final reply not found for turn ${turnId}`);
      }

      log(`step 5/7: verifying chat processing turns off`);
      const offPoll = await pollChatProcessing(T3_CHAT_CARD_ID, false, `chat processing off for ${T3_CHAT_CARD_ID}`, 16, 1_000);
      if (!offPoll.matched) throw new Error(`chat processing did not turn off for ${T3_CHAT_CARD_ID}`);

      log(`step 6/7: verifying final inspected messages`);
      const finalMessages = await readChatMessages(T3_CHAT_CARD_ID, turnId);
      const finalUser = finalMessages.find((message) => message?.role === 'user');
      const finalAssistant = finalMessages.find((message) => message?.role === 'assistant');
      if (!finalUser || !finalAssistant) throw new Error(`final persisted messages missing for turn ${turnId}`);
      recordAiResponse('T3', String(finalAssistant.text || ''));
      if (String(finalUser.text || '') !== promptText || !String(finalAssistant.text || '').includes(expectedReply)) {
        throw new Error(`final chat messages mismatch for turn ${turnId}`);
      }

      log(`step 7/8: verifying watchparty tools for ${T3_CHAT_CARD_ID}`);
      await waitForStageAiResponseWatchParty('T3', T3_CHAT_CARD_ID);

      log(`step 8/8: verifying live /sse board-state bootstrap`);
      await reopenBoardSse();
      await waitForSseSummary(`T3 SSE summary for ${T3_CHAT_CARD_ID}`);
      await waitForCompletedCard(T3_CHAT_CARD_ID, `T3 SSE completed status for ${T3_CHAT_CARD_ID}`);
      await closeBoardSse();
      resetSseState();
      return;
    }

    if (caseId === 'T3u') {
      log(`step 0/8: upserting ${T3U_CHAT_CARD_ID} for chat`);
      await callMcp('manage.upsert-card', {
        card_id: T3U_CHAT_CARD_ID,
        candidate_card_content: buildPortfolioCard(T3U_CHAT_CARD_ID),
      });
      recordCard(T3U_CHAT_CARD_ID);
      await ensureBoardSseConnection();
      await subscribeCardChats(T3U_CHAT_CARD_ID);

      const promptText = 'hi testing';
      const probeText = buildProbeChatText(promptText, 'echo');

      log(`step 1/8: sending chat through ChatPane UI`);
      await sendChatThroughUi(T3U_CHAT_CARD_ID, probeText, 'T3u');

      log(`step 2/8: verifying AI working bubble appears in ChatPane`);
      await waitForWorkingBubbleVisible(T3U_CHAT_CARD_ID, 'T3u');

      log(`step 3/8: verifying user chat entry is stored`);
      const userPoll = await pollChatMessages(T3U_CHAT_CARD_ID, '', (messages) => messages.some((message) => message?.role === 'user' && String(message?.text || '') === promptText), `user chat message for prompt ${promptText}`, 8, 500);
      if (!userPoll.matched) throw new Error(`user message not found for prompt ${promptText}`);
      const userMessage = userPoll.messages.find((message) => message?.role === 'user' && String(message?.text || '') === promptText);
      const turnId = String(userMessage?.turn || '').trim();
      if (!turnId) throw new Error(`user message turn id missing for prompt ${promptText}`);

      log(`step 4/8: verifying chat processing turns on`);
      const onPoll = await pollChatProcessing(T3U_CHAT_CARD_ID, true, `chat processing on for ${T3U_CHAT_CARD_ID}`, 8, 1_000);
      if (!onPoll.matched) throw new Error(`chat processing did not turn on for ${T3U_CHAT_CARD_ID}`);

      const expectedReply = `Echo: ${promptText}`;
      log(`step 5/8: waiting for probe final reply`);
      const assistantPoll = await pollChatMessages(T3U_CHAT_CARD_ID, turnId, (messages) => messages.some((message) => message?.role === 'assistant' && String(message?.text || '').includes(expectedReply)), `probe final reply for turn ${turnId}`, 16, 1_000);
      if (!assistantPoll.matched) {
        recordAiResponse('T3u', readLatestAssistantText(assistantPoll.messages));
        throw new Error(`probe final reply not found for turn ${turnId}`);
      }

      log(`step 6/8: verifying chat processing turns off`);
      const offPoll = await pollChatProcessing(T3U_CHAT_CARD_ID, false, `chat processing off for ${T3U_CHAT_CARD_ID}`, 16, 1_000);
      if (!offPoll.matched) throw new Error(`chat processing did not turn off for ${T3U_CHAT_CARD_ID}`);

      log(`step 7/8: verifying final inspected messages`);
      const finalMessages = await readChatMessages(T3U_CHAT_CARD_ID, turnId);
      const finalUser = finalMessages.find((message) => message?.role === 'user');
      const finalAssistant = finalMessages.find((message) => message?.role === 'assistant');
      if (!finalUser || !finalAssistant) throw new Error(`final persisted messages missing for turn ${turnId}`);
      recordAiResponse('T3u', String(finalAssistant.text || ''));
      if (String(finalUser.text || '') !== promptText || !String(finalAssistant.text || '').includes(expectedReply)) {
        throw new Error(`final chat messages mismatch for turn ${turnId}`);
      }

      log(`step 8/9: verifying watchparty tools for ${T3U_CHAT_CARD_ID}`);
      await waitForStageAiResponseWatchParty('T3u', T3U_CHAT_CARD_ID);

      log(`step 9/9: verifying live /sse board-state bootstrap`);
      await reopenBoardSse();
      await waitForSseSummary(`T3u SSE summary for ${T3U_CHAT_CARD_ID}`);
      await waitForCompletedCard(T3U_CHAT_CARD_ID, `T3u SSE completed status for ${T3U_CHAT_CARD_ID}`);
      await closeBoardSse();
      resetSseState();
      await closeChatModalViaUi(T3U_CHAT_CARD_ID);
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
        throw createSmokeAssertionError('chat attachment metadata invalid after upload', {
          expected: {
            uploadFile: {
              present: true,
              hasPath: false,
            },
          },
          found: {
            uploadFile: buildAttachmentMetadataSnapshot(uploadedFile),
          },
        });
      }

      let storedFileResult;
      try {
        storedFileResult = await waitForStoredCardFile(
          T4_CHAT_CARD_ID,
          uploadedFile?.stored_name,
          `hook stored file state for ${T4_CHAT_CARD_ID}`,
          15_000,
        );
      } catch {
        const latestCardState = cardStatesRef.current[T4_CHAT_CARD_ID];
        const latestFiles = Array.isArray(latestCardState?.cardData?.files) ? latestCardState.cardData.files : EMPTY_ARRAY;
        throw createSmokeAssertionError('stored chat attachment metadata invalid after upload', {
          expected: {
            storedFile: {
              present: true,
              stored_name: String(uploadedFile?.stored_name || ''),
              chat: true,
              hasPath: false,
            },
          },
          found: {
            storedFile: null,
            availableStoredFiles: latestFiles.map((entry) => buildAttachmentMetadataSnapshot(entry)),
          },
        });
      }
      const storedFiles = storedFileResult.files;
      const storedFile = storedFileResult.file;
      if (!storedFile || storedFile?.chat !== true || Object.prototype.hasOwnProperty.call(storedFile || {}, 'path')) {
        throw createSmokeAssertionError('stored chat attachment metadata invalid after upload', {
          expected: {
            storedFile: {
              present: true,
              stored_name: String(uploadedFile?.stored_name || ''),
              chat: true,
              hasPath: false,
            },
          },
          found: {
            storedFile: buildAttachmentMetadataSnapshot(storedFile),
          },
        });
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
      log(`step 8/9: verifying watchparty tools for ${T4_CHAT_CARD_ID}`);
      await waitForStageAiResponseWatchParty('T4', T4_CHAT_CARD_ID);

      log(`step 9/9: final probe reply with attachment contents passed`);
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
  }, [appendLog, callAction, callControlplane, callMcp, closeBoardSse, ensureBoardRegistered, pollBoardStatus, pollChatMessages, pollChatProcessing, readChatMessages, reopenBoardSse, resetSseState, suiteContext.boardId, subscribeCardChats, unsubscribeCardChats, waitForCardStateData, waitForCardStatus, waitForCompletedCard, waitForSseSummary, waitForStoredCardFile]);

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
      attachment ? 24 : 16,
      500,
    );
    if (!userPoll.matched) {
      log(`user message not yet visible in reduced state for ${turnId}; continuing to final turn verification`);
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

    log(`step 6/7: verifying watchparty tools for ${cardId}`);
    await waitForStageAiResponseWatchParty(caseId, cardId);
    log(`step 7/7: verifying shared reduced board state for ${cardId}`);
    await waitForCardStateData(cardId, `${caseId} reduced card state for ${cardId}`, 15_000);
    log(`final assistant reply: ${String(finalAssistant.text || '')}`);
  }, [appendLog, callAction, callControlplane, callMcp, pollChatMessages, pollChatProcessing, readChatMessages, subscribeCardChats, waitForCardStateData, waitForStageAiResponseWatchParty]);

  const runHostedAssistantCasesInParallel = useCallback(async ({ onCasePassed, onCaseFailed } = {}) => {
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
    ].filter((config) => selectedSmokeCases.some((entry) => entry.id === config.caseId && entry.mode === 'run'));

    appendLog('', `Hosted chat smoke tests: running ${hostedConfigs.map((config) => config.caseId).join(', ')} in parallel on shared reduced state`);
    await reopenBoardSse();
    await waitForSseSummary('Hosted shared SSE summary', 15_000);
    // Settle every case (so each reports its own pass/fail as it completes) instead of
    // short-circuiting on the first rejection. Per-case status is attributed by caseId
    // via the callbacks rather than by parsing the aggregate error message.
    const settled = await Promise.allSettled(hostedConfigs.map(async (config) => {
      try {
        await runHostedAssistantSmoke(config);
        if (typeof onCasePassed === 'function') {
          onCasePassed(config.caseId);
        }
      } catch (error) {
        if (typeof onCaseFailed === 'function') {
          onCaseFailed(config.caseId, error);
        }
        throw error;
      }
    }));
    for (const config of hostedConfigs) {
      await unsubscribeCardChats(config.cardId);
    }
    const failures = settled.filter((result) => result.status === 'rejected').map((result) => result.reason);
    const cancelled = failures.find((error) => error?.code === 'CANCELLED');
    if (cancelled) {
      throw cancelled;
    }
    if (failures.length > 0) {
      throw failures[0];
    }
  }, [appendLog, reopenBoardSse, runHostedAssistantSmoke, selectedSmokeCases, unsubscribeCardChats, waitForSseSummary]);

  const handleRun = useCallback(async () => {
    if (suiteStatus === 'running') {
      return;
    }
    if (!normalizedOrigin) {
      setSuiteStatus('failed');
      setSuiteError('Server origin is required for smoke testing.');
      return;
    }
    if (selectedCaseResolution.unknownIds.length > 0) {
      setSuiteStatus('failed');
      setSuiteError(`Unknown smoke test ids: ${selectedCaseResolution.unknownIds.join(', ')}`);
      return;
    }

    cancelRef.current = false;
    const trackedCardIds = [...runtimeRef.current.createdCardIds];
    runtimeRef.current = {
      ...createRuntimeState(normalizedOrigin, SMOKE_BOARD_ID),
      createdCardIds: new Set(),
    };
    setSuiteStatus('running');
    setSuiteError('');
    setActiveCaseId('');
    setCaseStates(createInitialCaseState(selectedSmokeCases));
    setLogs([]);
    setAiResponses({});
    setStartedAt(Date.now());
    setFinishedAt(0);
    appendLog('', `Smoke runner targeting board '${SMOKE_BOARD_ID}' at ${normalizedOrigin}`);
    if (selectedCaseResolution.requestedIds.length > 0) {
      appendLog('', `Selected smoke cases: ${selectedSmokeCases.map((entry) => entry.id).join(', ')}`);
    } else {
      appendLog('', 'Selected smoke cases: all');
    }

    try {
      const mb1Entry = selectedSmokeCases.find((entry) => entry.id === 'MB1');
      if (mb1Entry && mb1Entry.mode === 'run') {
        ensureNotCancelled(cancelRef);
        setActiveCaseId(mb1Entry.id);
        markCase(mb1Entry.id, { status: 'running', startedAt: Date.now(), finishedAt: 0, detail: 'Running…', comparison: null });
        appendLog(mb1Entry.id, `Starting ${mb1Entry.id}: ${mb1Entry.title}`);
        try {
          await runCase(mb1Entry.id);
          markCase(mb1Entry.id, { status: 'passed', finishedAt: Date.now(), comparison: null });
          appendLog(mb1Entry.id, `${mb1Entry.id} passed`, 'success');
        } catch (error) {
          if (error?.code === 'CANCELLED') {
            throw error;
          }
          markCase(mb1Entry.id, {
            status: 'failed',
            finishedAt: Date.now(),
            detail: error instanceof Error ? error.message : String(error),
            comparison: readSmokeComparison(error),
          });
          appendLog(mb1Entry.id, error instanceof Error ? error.message : String(error), 'error');
          throw error;
        }
      }

      await clearSmokeCardsAtStart(trackedCardIds);
      await warmChatQueue();
      let computeChatParallelHandled = false;
      let hostedParallelHandled = false;
      for (const entry of selectedSmokeCases) {
        if (entry.id === 'MB1') {
          continue;
        }
        ensureNotCancelled(cancelRef);
        setActiveCaseId(entry.id);
        if (entry.mode === 'skip') {
          markCase(entry.id, {
            status: 'skipped',
            detail: entry.reason,
            comparison: null,
            startedAt: Date.now(),
            finishedAt: Date.now(),
          });
          appendLog(entry.id, entry.reason, 'warn');
          continue;
        }

        if (['T2', 'T3', 'T4'].includes(entry.id)) {
          if (computeChatParallelHandled) {
            continue;
          }
          computeChatParallelHandled = true;
          const parallelEntries = selectedSmokeCases.filter((candidate) => ['T2', 'T3', 'T4'].includes(candidate.id) && candidate.mode === 'run');
          const startedAtValue = Date.now();
          for (const parallelEntry of parallelEntries) {
            markCase(parallelEntry.id, { status: 'running', startedAt: startedAtValue, finishedAt: 0, detail: 'Running in parallel…', comparison: null });
            appendLog(parallelEntry.id, `Starting ${parallelEntry.id}: ${parallelEntry.title}`);
          }
          // Run each case concurrently but settle (and reflect status) per case as it
          // finishes, so a case that completes early is shown passed/failed immediately
          // instead of staying "running" until the slowest sibling settles.
          const parallelSettled = await Promise.allSettled(parallelEntries.map(async (parallelEntry) => {
            try {
              await runCase(parallelEntry.id);
              markCase(parallelEntry.id, { status: 'passed', finishedAt: Date.now(), comparison: null });
              appendLog(parallelEntry.id, `${parallelEntry.id} passed`, 'success');
            } catch (error) {
              if (error?.code === 'CANCELLED') {
                throw error;
              }
              const message = error instanceof Error ? error.message : String(error);
              markCase(parallelEntry.id, {
                status: 'failed',
                finishedAt: Date.now(),
                detail: message,
                comparison: readSmokeComparison(error),
              });
              appendLog(parallelEntry.id, message, 'error');
              throw error;
            }
          }));
          const parallelFailures = parallelSettled.filter((result) => result.status === 'rejected').map((result) => result.reason);
          const parallelCancelled = parallelFailures.find((error) => error?.code === 'CANCELLED');
          if (parallelCancelled) {
            throw parallelCancelled;
          }
          if (parallelFailures.length > 0) {
            throw parallelFailures[0];
          }
          continue;
        }

        if (['T8', 'T9', 'T8F', 'T9F'].includes(entry.id)) {
          if (hostedParallelHandled) {
            continue;
          }
          hostedParallelHandled = true;
          const hostedEntries = selectedSmokeCases.filter((candidate) => ['T8', 'T9', 'T8F', 'T9F'].includes(candidate.id) && candidate.mode === 'run');
          const startedAtValue = Date.now();
          for (const hostedEntry of hostedEntries) {
            markCase(hostedEntry.id, { status: 'running', startedAt: startedAtValue, finishedAt: 0, detail: 'Running in parallel…', comparison: null });
            appendLog(hostedEntry.id, `Starting ${hostedEntry.id}: ${hostedEntry.title}`);
          }
          // Reflect each hosted case's outcome the moment it settles (attributed by
          // caseId, not by substring-matching the error message) so an early finisher
          // is not stuck "running" and a sibling's failure is not misattributed.
          await runHostedAssistantCasesInParallel({
            onCasePassed: (caseId) => {
              markCase(caseId, { status: 'passed', finishedAt: Date.now(), comparison: null });
              appendLog(caseId, `${caseId} passed`, 'success');
            },
            onCaseFailed: (caseId, error) => {
              if (error?.code === 'CANCELLED') {
                return;
              }
              const message = error instanceof Error ? error.message : String(error);
              markCase(caseId, {
                status: 'failed',
                finishedAt: Date.now(),
                detail: message,
                comparison: readSmokeComparison(error),
              });
              appendLog(caseId, message, 'error');
            },
          });
          continue;
        }

        markCase(entry.id, { status: 'running', startedAt: Date.now(), finishedAt: 0, detail: 'Running…', comparison: null });
        appendLog(entry.id, `Starting ${entry.id}: ${entry.title}`);
        try {
          await runCase(entry.id);
          markCase(entry.id, { status: 'passed', finishedAt: Date.now(), comparison: null });
          appendLog(entry.id, `${entry.id} passed`, 'success');
        } catch (error) {
          if (error?.code === 'CANCELLED') {
            throw error;
          }
          markCase(entry.id, {
            status: 'failed',
            finishedAt: Date.now(),
            detail: error instanceof Error ? error.message : String(error),
            comparison: readSmokeComparison(error),
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
  }, [appendAiResponseSummary, appendLog, cleanup, clearSmokeCardsAtStart, markCase, normalizedOrigin, runCase, runHostedAssistantCasesInParallel, selectedCaseResolution, selectedSmokeCases, suiteStatus, warmChatQueue]);

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

  const deferredLogs = useDeferredValue(logs);
  const deferredCaseStates = useDeferredValue(caseStates);
  const deferredAiResponses = useDeferredValue(aiResponses);

  const summaryChips = useMemo(() => {
    const counts = deferredCaseStates.reduce((acc, entry) => {
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
  }, [deferredCaseStates]);

  const orderedAiResponses = useMemo(() => {
    return AI_RESPONSE_CASE_ORDER
      .filter((caseId) => selectedSmokeCaseIds.has(caseId))
      .filter((caseId) => typeof deferredAiResponses[caseId] === 'string' && deferredAiResponses[caseId].trim())
      .map((caseId) => {
        const responseText = deferredAiResponses[caseId].trim();
        const expectation = AI_RESPONSE_EXPECTATIONS[caseId];
        const isMatch = expectation ? expectation.matches(responseText) : true;
        return {
          caseId,
          responseText,
          expectedLabel: !isMatch && expectation ? expectation.expectedLabel : '',
          statusMark: isMatch ? '✓' : '✗',
        };
      });
  }, [deferredAiResponses, selectedSmokeCaseIds]);

  const renderedLogText = useMemo(() => (
    deferredLogs.length > 0
      ? deferredLogs.map((entry) => `[${new Date(entry.at).toLocaleTimeString()}]${entry.caseId ? ` [${entry.caseId}]` : ''} ${entry.message}`).join('\n')
      : 'No smoke run started yet.'
  ), [deferredLogs]);

  const durationText = startedAt
    ? `${Math.max(0, Math.round(((finishedAt || Date.now()) - startedAt) / 1000))}s`
    : '0s';

  const handleToggleSmokeCase = useCallback((caseId, checked) => {
    startTransition(() => {
      const nextSelectedIds = new Set(selectedRunnableCaseIds);
      if (checked) {
        nextSelectedIds.add(caseId);
      } else {
        nextSelectedIds.delete(caseId);
      }
      setRunTestsText(formatSelectedSmokeCaseIds(nextSelectedIds));
    });
  }, [selectedRunnableCaseIds]);

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

          <div style={TEST_SELECTOR_STYLE}>
            <div style={{ display: 'grid', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-soft)' }}>Run Tests</span>
              <input
                type="text"
                value={runTestsText}
                onChange={(event) => setRunTestsText(event.target.value)}
                placeholder={RUN_TESTS_PLACEHOLDER}
                disabled={suiteStatus === 'running'}
                data-testid="smoke-runner-run-tests-input"
                style={{
                  minWidth: '18rem',
                  border: '1px solid var(--color-border-strong)',
                  borderRadius: '0.5rem',
                  background: 'var(--color-surface-raised)',
                  color: 'var(--color-text)',
                  padding: '0.5rem 0.65rem',
                  fontSize: '0.82rem',
                }}
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-soft)' }}>
                Leave empty to run all tests, or type a comma-separated subset. The checkboxes below stay in sync.
              </div>
            </div>
            <div style={TEST_CHECKBOX_GRID_STYLE}>
              {RUNNABLE_SMOKE_CASES.map((entry) => (
                <label key={entry.id} style={TEST_CHECKBOX_LABEL_STYLE}>
                  <input
                    type="checkbox"
                    checked={selectedRunnableCaseIds.has(entry.id)}
                    onChange={(event) => handleToggleSmokeCase(entry.id, event.target.checked)}
                    disabled={suiteStatus === 'running'}
                    data-testid={`smoke-runner-case-toggle-${entry.id}`}
                  />
                  <span>{entry.id}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="global-modal__section">
            <div className="global-modal__section-title">Summary</div>
            <div style={{ fontSize: '0.76rem', color: 'var(--color-text-soft)', marginBottom: '0.65rem' }}>
              {selectedCaseResolution.requestedIds.length > 0
                ? `Running selected cases in built-in order: ${selectedSmokeCases.map((entry) => entry.id).join(', ') || 'none'}`
                : 'Running all smoke cases. Leave Run Tests empty to keep this default.'}
            </div>
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
              {deferredCaseStates.map((entry) => {
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
                    {entry.comparison ? (
                      <div
                        style={{
                          marginTop: '0.6rem',
                          borderTop: '1px solid color-mix(in srgb, var(--color-border-strong) 60%, transparent)',
                          paddingTop: '0.6rem',
                          display: 'grid',
                          gap: '0.45rem',
                        }}
                      >
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text)' }}>Expected vs Found</div>
                        <div style={{ display: 'grid', gap: '0.4rem' }}>
                          <div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-soft)' }}>Expected</div>
                            <pre className="global-modal__pre" style={{ margin: 0, maxHeight: '8rem' }}>{jsonText(entry.comparison.expected)}</pre>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-soft)' }}>Found</div>
                            <pre className="global-modal__pre" style={{ margin: 0, maxHeight: '8rem' }}>{jsonText(entry.comparison.found)}</pre>
                          </div>
                        </div>
                      </div>
                    ) : null}
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
            >{renderedLogText}</pre>
          </div>
        </div>
      </div>
    </GlobalModal>
  );
}