import { expect, test } from '@playwright/test';

const BOARD_ID = 'live';
const ECHO_PROBE_MARKER = '__probe__echo__probe__';
const TEST_APP_CONFIG = {
  defaultBoardId: BOARD_ID,
  defaultBoard: {
    id: BOARD_ID,
    label: 'Live',
    subtitle: 'Live operational intelligence for agent workflows',
  },
  pageTitle: 'Live',
  pageSubtitle: 'Live operational intelligence for agent workflows',
  refreshAllIntervalSeconds: 300,
  transportMode: 'inbrowser',
  serverOrigin: 'http://127.0.0.1:7810',
  storage: {
    adapter: 'localstorage',
    seedCardsUrl: '/seed-cards/{boardId}.json',
    firestore: {
      firebaseConfig: {},
      appName: '',
      refs: {},
    },
    localstorage: {
      refs: {},
    },
  },
  boardServerConstants: {
    copilotOutputChannel: 'copilot-output',
    copilotToolsChannel: 'copilot-tools',
  },
};
const TEST_SEED_CARDS = [
  {
    id: 'card-portfolio',
    meta: {
      title: 'My Portfolio',
      tags: ['portfolio'],
      desc: 'Deterministic test holdings for Playwright smoke coverage.',
    },
    provides: [
      {
        bindTo: 'holdings',
        ref: 'card_data.holdings',
      },
    ],
    view: {
      elements: [
        {
          kind: 'editable-table',
          label: 'Holdings',
          data: {
            bind: 'card_data.holdings',
            writeTo: 'card_data.holdings',
            columns: ['ticker', 'quantity', 'cost_basis'],
          },
        },
      ],
      features: {
        chat: true,
      },
    },
    card_data: {
      holdings: [
        { ticker: 'AAPL', quantity: 66, cost_basis: 150 },
        { ticker: 'MSFT', quantity: 5, cost_basis: 310 },
        { ticker: 'GOOGL', quantity: 2, cost_basis: 280 },
        { ticker: 'TSLA', quantity: 3, cost_basis: 200 },
      ],
    },
  },
  {
    id: 'card-market-prices',
    meta: {
      title: 'Market Prices',
      tags: ['prices', 'market'],
      desc: 'Deterministic quote fixture for browser smoke coverage.',
    },
    provides: [
      {
        bindTo: 'quotes',
        ref: 'card_data.quotes',
      },
    ],
    view: {
      elements: [
        {
          kind: 'table',
          label: 'Quotes',
          data: {
            bind: 'card_data.quotes.quoteResponse.result',
            columns: ['symbol', 'regularMarketPrice', 'regularMarketChangePercent'],
          },
        },
      ],
    },
    card_data: {
      quotes: {
        quoteResponse: {
          result: [
            {
              symbol: 'AAPL',
              shortName: 'Apple Inc.',
              regularMarketPrice: 198.15,
              regularMarketChange: 2.15,
              regularMarketChangePercent: 1.1,
            },
            {
              symbol: 'MSFT',
              shortName: 'Microsoft Corp.',
              regularMarketPrice: 415.32,
              regularMarketChange: -1.23,
              regularMarketChangePercent: -0.3,
            },
            {
              symbol: 'GOOGL',
              shortName: 'Alphabet Inc.',
              regularMarketPrice: 174.89,
              regularMarketChange: 0.89,
              regularMarketChangePercent: 0.51,
            },
            {
              symbol: 'TSLA',
              shortName: 'Tesla Inc.',
              regularMarketPrice: 247.12,
              regularMarketChange: 5.43,
              regularMarketChangePercent: 2.25,
            },
            {
              symbol: 'NVDA',
              shortName: 'NVIDIA Corp.',
              regularMarketPrice: 121.0,
              regularMarketChange: 1.6,
              regularMarketChangePercent: 1.34,
            },
          ],
          error: null,
        },
      },
    },
  },
  {
    id: 'card-portfolio-value',
    meta: {
      title: 'Portfolio Value',
      tags: ['portfolio', 'value'],
      desc: 'Computes deterministic per-position values from holdings.',
    },
    requires: ['holdings'],
    provides: [
      {
        bindTo: 'positions',
        ref: 'computed_values.positions',
      },
    ],
    compute: [
      {
        bindTo: 'positions',
        expr: "$map(requires.holdings, function($h) { {\"ticker\": $h.ticker, \"quantity\": $h.quantity, \"cost_basis\": $h.cost_basis, \"price\": 100, \"value\": $round($h.quantity * 100, 2), \"gain_$\": $round(($h.quantity * 100) - ($h.cost_basis * $h.quantity), 2), \"gain_%\": $round((($h.quantity * 100) - ($h.cost_basis * $h.quantity)) / ($h.cost_basis * $h.quantity) * 100, 2), \"chg_$\": 0, \"chg_pct\": 0 } })",
      },
      {
        bindTo: 'totalValue',
        expr: '$round($sum(computed_values.positions.value), 2)',
      },
      {
        bindTo: 'gainersLosers',
        expr: "$count($filter(computed_values.positions, function($p){ $p.chg_pct > 0 })) & ' up · ' & $count($filter(computed_values.positions, function($p){ $p.chg_pct < 0 })) & ' down'",
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
          },
        },
      ],
      features: {
        chat: true,
      },
    },
    card_data: {},
  },
];

async function installHarness(page, boardId = BOARD_ID) {
  await page.route('**/app-config.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(TEST_APP_CONFIG),
    });
  });

  await page.route('**/seed-cards/live.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(TEST_SEED_CARDS),
    });
  });

  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      // ignore storage clear failures during bootstrap
    }
  });

  await page.goto('/');

  await page.evaluate(async ({ targetBoardId }) => {
    const { createBoardTestHarness } = await import('/tests/support/board-test-harness.js');
    const existing = window.__boardSmokeHarness;
    if (existing) existing.dispose();
    const harness = createBoardTestHarness({ boardId: targetBoardId });
    await harness.start();
    await harness.waitForInitialPayload();
    window.__boardSmokeHarness = harness;
  }, { targetBoardId: boardId });
}

async function disposeHarness(page) {
  await page.evaluate(() => {
    window.__boardSmokeHarness?.dispose?.();
    delete window.__boardSmokeHarness;
  }).catch(() => {});
}

test.beforeEach(async ({ page }) => {
  await installHarness(page);
});

test.afterEach(async ({ page }) => {
  await disposeHarness(page);
});

test('T0 bootstraps and completes the board runtime', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const harness = window.__boardSmokeHarness;
    const initialPayload = harness.getInitialPayload() ?? await harness.waitForInitialPayload();
    await harness.callWebhooksMcp('webhook.process-accumulated', {});
    const runtimeStatus = await harness.callMcp('inspect.board-runtime-status', {});
    const portfolioRead = await harness.callMcp('manage.read-card', { card_id: 'card-portfolio' });
    const portfolioCard = Array.isArray(portfolioRead.data) ? portfolioRead.data[0] : null;
    const holdings = portfolioCard?.card_data?.holdings ?? [];

    return {
      cardIds: (initialPayload.cardDefinitions ?? []).map((card) => card.id).sort(),
      runtimeStatus,
      holdingsCount: holdings.length,
    };
  });

  expect(result.cardIds).toEqual([
    'card-market-prices',
    'card-portfolio',
    'card-portfolio-value',
  ]);
  expect(result.runtimeStatus.status).toBe('success');
  expect(result.runtimeStatus.data.summary.failed).toBe(0);
  expect(result.runtimeStatus.data.summary.card_count).toBeGreaterThan(0);
  expect(result.holdingsCount).toBeGreaterThan(0);
});

test('T1 reports unsupported manage.upsert-card without a non-core adapter', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { callBoardControlplaneMcp } = await import('/src/lib/client.js');
    const response = await callBoardControlplaneMcp('live', 'manage.upsert-card', {
      card_id: 'card-portfolio',
      candidate_card_content: {
        id: 'card-portfolio',
        card_data: {
          holdings: [{ ticker: 'NVDA', quantity: 1, cost_basis: 100 }],
        },
      },
    });
    const body = await response.json();
    return {
      status: response.status,
      body,
    };
  });

  expect(result.status).toBe(500);
  expect(String(result.body.error || '')).toContain('Board non-core adapter is not configured for MCP preflight/discovery tools');
});

test('T2 uploads a text file and round-trips its bytes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const harness = window.__boardSmokeHarness;
    const cardId = 'card-market-prices';

    const before = await harness.callMcp('manage.read-card', { card_id: cardId });
    if (before.status !== 'success') {
      throw new Error(`manage.read-card before upload failed: ${JSON.stringify(before)}`);
    }
    const beforeCard = Array.isArray(before.data) ? before.data[0] : null;
    const beforeFiles = beforeCard?.card_data?.files ?? [];

    const upload = await harness.uploadTextCardFileViaControlplane(cardId, {
      fileName: 't2-upload.txt',
      text: 'plain-file-upload-from-playwright',
    });
    if (upload.status !== 'success') {
      throw new Error(`manage.upload-card-file failed: ${JSON.stringify(upload)}`);
    }
    const uploaded = upload.data.file;

    const after = await harness.callMcp('manage.read-card', { card_id: cardId });
    if (after.status !== 'success') {
      throw new Error(`manage.read-card after upload failed: ${JSON.stringify(after)}`);
    }
    const afterCard = Array.isArray(after.data) ? after.data[0] : null;
    const afterFiles = afterCard?.card_data?.files ?? [];
    const fileIndex = afterFiles.findIndex((file) => file?.stored_name === uploaded?.stored_name);
    const downloadedText = await harness.downloadCardFileText(cardId, fileIndex, uploaded?.stored_name || '');

    return {
      beforeCount: beforeFiles.length,
      afterCount: afterFiles.length,
      fileIndex,
      downloadedText,
    };
  });

  expect(result.afterCount).toBe(result.beforeCount + 1);
  expect(result.fileIndex).toBeGreaterThanOrEqual(0);
  expect(result.downloadedText).toBe('plain-file-upload-from-playwright');
});

test('T3 reports unsupported chat-send when no chat handler is configured', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const harness = window.__boardSmokeHarness;
    const cardId = 'card-portfolio';
    await harness.subscribeCardChats(cardId);
    const beforeMessages = harness.getChatState(cardId)?.messages ?? [];
    const { dispatchAction } = await import('/src/lib/client.js');
    const response = await dispatchAction('live', cardId, 'chat-send', {
      text: 'hello from playwright',
      'turn-id': `pw-${Date.now()}`,
    });
    const body = await response.json();
    const afterMessages = harness.getChatState(cardId)?.messages ?? [];

    return {
      status: response.status,
      body,
      beforeCount: beforeMessages.length,
      afterCount: afterMessages.length,
    };
  });

  expect(result.status).toBe(409);
  expect(String(result.body.error || '')).toContain('chat handler is not configured for card: card-portfolio');
  expect(result.afterCount).toBe(result.beforeCount);
});