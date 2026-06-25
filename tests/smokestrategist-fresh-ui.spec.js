import { expect, test } from '@playwright/test';

const STRATEGIST_BOARD_ID = 'live-test-journey-frontend';
const MANAGE_BOARDS_URL = 'http://127.0.0.1:7799/manage-boards';
const STRATEGIST_BOARD_RECORD = {
  label: 'live-test-journey-frontend',
  ai: 'copilot',
  aiWorkspaceTemplate: 'default',
  refsTemplate: 'localfs-default',
  uiTemplate: 'journeys',
  metadata: {
    pageTitle: 'Live Test Journey',
    pageSubtitle: 'Strategist smoke board',
  },
};

const RUN_CASE_IDS = ['MB1', 'SX', 'SB'];
const SKIP_CASE_IDS = ['SC'];

async function readManageBoardsPayload(response, operation) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${operation} failed with status ${response.status}: ${JSON.stringify(payload)}`);
  }
  if (payload?.status !== 'success') {
    throw new Error(`${operation} returned non-success payload: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function ensureStrategistBoardRegistered(request) {
  const listPayload = await readManageBoardsPayload(
    await request.post(MANAGE_BOARDS_URL, {
      data: { subcommand: 'list-boards' },
    }),
    'list-boards',
  );
  const boardIds = Array.isArray(listPayload?.data?.boards)
    ? listPayload.data.boards.map((board) => String(board?.id || '').trim()).filter(Boolean)
    : [];
  if (boardIds.includes(STRATEGIST_BOARD_ID)) {
    return;
  }

  await readManageBoardsPayload(
    await request.post(MANAGE_BOARDS_URL, {
      data: {
        subcommand: 'add-board',
        args: {
          boardId: STRATEGIST_BOARD_ID,
          record: STRATEGIST_BOARD_RECORD,
        },
      },
    }),
    'add-board',
  );
}

async function waitForSuiteOutcome(statusChip, logPane, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [statusText, logText] = await Promise.all([
      statusChip.textContent(),
      logPane.textContent(),
    ]);
    const normalizedStatusText = String(statusText || '');
    const normalizedLogText = String(logText || '');

    if (normalizedStatusText.includes('PASSED')) {
      return normalizedLogText;
    }

    if (normalizedStatusText.includes('FAILED') || normalizedStatusText.includes('CANCELLED')) {
      const recentLines = normalizedLogText.trim().split('\n').slice(-12).join('\n');
      throw new Error(`SmokeStrategist (fresh) did not complete successfully:\n${recentLines}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('Timed out waiting for SmokeStrategist (fresh) full-suite completion.');
}

async function ensureStrategistBoardSelected(page) {
  const boardSettingsDialog = page.locator('aside[aria-label="Board settings"].is-open');
  const boardSelect = page.getByTestId('board-settings-board-select');

  await expect(boardSettingsDialog).toBeVisible();
  await expect(boardSelect).toBeVisible();

  const currentBoardId = await boardSelect.inputValue();
  if (currentBoardId !== STRATEGIST_BOARD_ID) {
    await boardSelect.selectOption(STRATEGIST_BOARD_ID);
    await page.getByRole('button', { name: 'Switch board' }).click();
    await expect(boardSettingsDialog).toBeHidden();
    await page.getByTestId('open-board-settings').click();
    await expect(boardSettingsDialog).toBeVisible();
    await expect(boardSelect).toHaveValue(STRATEGIST_BOARD_ID);
  }
}

test('SmokeStrategist fresh mode resets the board to its seed and completes a live cycle', async ({ page, request }) => {
  test.setTimeout(20 * 60_000);

  await ensureStrategistBoardRegistered(request);

  await page.goto('/');
  await page.getByTestId('open-board-settings').click();

  await ensureStrategistBoardSelected(page);

  const strategistButton = page.getByTestId('board-settings-smoke-strategist-button');
  await expect(strategistButton).toBeEnabled();
  await strategistButton.click();

  await expect(page.getByText(`Strategist Smoke Runner: ${STRATEGIST_BOARD_ID}`)).toBeVisible();

  // Select Fresh mode before running so MB1 resets the board down to its seed.
  const freshModeButton = page.getByTestId('smoke-strategist-mode-fresh');
  await freshModeButton.click();
  await expect(freshModeButton).toHaveAttribute('aria-checked', 'true');

  await page.getByTestId('smoke-strategist-run-button').click();

  const statusChip = page.getByTestId('smoke-strategist-suite-status');
  const logPane = page.getByTestId('smoke-strategist-log');
  await expect(statusChip).toContainText('RUNNING', { timeout: 30_000 });

  await expect(page.getByTestId('smoke-strategist-case-status-MB1')).toContainText('passed', { timeout: 2 * 60_000 });

  const finalLogText = await waitForSuiteOutcome(statusChip, logPane, 18 * 60_000);
  await expect(statusChip).toContainText('PASSED', { timeout: 30_000 });

  for (const caseId of RUN_CASE_IDS) {
    await expect(page.getByTestId(`smoke-strategist-case-status-${caseId}`)).toContainText('passed');
  }

  for (const caseId of SKIP_CASE_IDS) {
    await expect(page.getByTestId(`smoke-strategist-case-status-${caseId}`)).toContainText('skipped');
  }

  // MB1 took the fresh-reset path (board reset to seed, not deprecate/recreate),
  // and SX completed a cycle rather than timing out.
  expect(finalLogText).toContain('reset to seed');
  expect(finalLogText).toContain('[SX]');
  expect(finalLogText).toContain('move surfaced');
  expect(finalLogText).toContain('[SB]');

  const movePane = page.getByTestId('smoke-strategist-move');
  await expect(movePane).not.toContainText('No move captured yet.');

  const failureSummaryChip = page.locator('.global-modal__chip--fail').filter({ hasText: /^Failed\s+[1-9]/ });
  await expect(failureSummaryChip).toHaveCount(0);

  await expect(page.getByText(`Strategist Smoke Runner: ${STRATEGIST_BOARD_ID}`)).toBeVisible();
});
