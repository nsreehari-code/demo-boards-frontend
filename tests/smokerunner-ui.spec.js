import { expect, test } from '@playwright/test';

const SMOKE_BOARD_ID = 'live-test-frontend';
const MANAGE_BOARDS_URL = 'http://127.0.0.1:7799/manage-boards';
const SMOKE_BOARD_RECORD = {
  label: 'live-test-frontend',
  ai: 'copilot',
  aiWorkspaceTemplate: 'default',
  refsTemplate: 'localfs-default',
  uiTemplate: 'default',
};

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

async function ensureSmokeRunnerBoardRegistered(request) {
  const listPayload = await readManageBoardsPayload(
    await request.post(MANAGE_BOARDS_URL, {
      data: { subcommand: 'list-boards' },
    }),
    'list-boards',
  );
  const boardIds = Array.isArray(listPayload?.data?.boards)
    ? listPayload.data.boards.map((board) => String(board?.id || '').trim()).filter(Boolean)
    : [];
  if (boardIds.includes(SMOKE_BOARD_ID)) {
    return;
  }

  await readManageBoardsPayload(
    await request.post(MANAGE_BOARDS_URL, {
      data: {
        subcommand: 'add-board',
        args: {
          boardId: SMOKE_BOARD_ID,
          record: SMOKE_BOARD_RECORD,
        },
      },
    }),
    'add-board',
  );
}

async function waitForWarmupOutcome(statusChip, logPane, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [statusText, logText] = await Promise.all([
      statusChip.textContent(),
      logPane.textContent(),
    ]);
    const normalizedStatusText = String(statusText || '');
    const normalizedLogText = String(logText || '');

    if (normalizedLogText.includes('[warmup] chat queue ready')) {
      return;
    }

    if (normalizedStatusText.includes('FAILED')) {
      const recentLines = normalizedLogText.trim().split('\n').slice(-8).join('\n');
      throw new Error(`SmokeRunner failed during warmup before readiness:\n${recentLines}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error('Timed out waiting for SmokeRunner warmup readiness.');
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
      throw new Error(`SmokeRunner did not complete successfully:\n${recentLines}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('Timed out waiting for SmokeRunner full-suite completion.');
}

const RUN_CASE_IDS = ['MB1', 'T0', 'T1', 'T2', 'T3', 'T3u', 'T4', 'T8', 'T9', 'T8F', 'T9F', 'TR'];
const SKIP_CASE_IDS = ['TQ', 'TT', 'TS'];

async function ensureLiveTestBoard(page) {
  const boardSettingsDialog = page.locator('[role="dialog"][aria-label="Board settings"]');
  const boardSelect = page.getByTestId('board-settings-board-select');

  await expect(boardSettingsDialog).toBeVisible();
  await expect(boardSelect).toBeVisible();

  const currentBoardId = await boardSelect.inputValue();
  if (currentBoardId !== SMOKE_BOARD_ID) {
    await boardSelect.selectOption(SMOKE_BOARD_ID);
    await page.getByRole('button', { name: 'Switch board' }).click();
    await expect(page.locator('[role="dialog"][aria-label="Board settings"]')).toBeHidden();
    await page.getByTestId('open-board-settings').click();
    await expect(boardSettingsDialog).toBeVisible();
    await expect(boardSelect).toHaveValue(SMOKE_BOARD_ID);
  }
}

test('SmokeRunner can be launched from App Config and complete the full rendered UI suite', async ({ page, request }) => {
  test.setTimeout(15 * 60_000);

  await ensureSmokeRunnerBoardRegistered(request);

  await page.goto('/');
  await page.getByTestId('open-board-settings').click();

  await ensureLiveTestBoard(page);

  const testButton = page.getByTestId('board-settings-smoke-test-button');
  await expect(testButton).toBeEnabled();
  await testButton.click();

  await expect(page.getByText(`Smoke Runner: ${SMOKE_BOARD_ID}`)).toBeVisible();
  await page.getByTestId('smoke-runner-run-button').click();

  const statusChip = page.getByTestId('smoke-runner-suite-status');
  const logPane = page.getByTestId('smoke-runner-log');
  const mb1Status = page.getByTestId('smoke-runner-case-status-MB1');
  await expect(statusChip).toContainText('RUNNING', { timeout: 30_000 });

  await expect(logPane).toContainText('[warmup]', { timeout: 30_000 });
  await waitForWarmupOutcome(statusChip, logPane, 2 * 60_000);
  await expect(mb1Status).toContainText('passed', { timeout: 2 * 60_000 });

  const finalLogText = await waitForSuiteOutcome(statusChip, logPane, 13 * 60_000);
  await expect(statusChip).toContainText('PASSED', { timeout: 30_000 });

  for (const caseId of RUN_CASE_IDS) {
    await expect(page.getByTestId(`smoke-runner-case-status-${caseId}`)).toContainText('passed');
  }

  for (const caseId of SKIP_CASE_IDS) {
    await expect(page.getByTestId(`smoke-runner-case-status-${caseId}`)).toContainText('skipped');
  }

  expect(finalLogText).toContain('[T8]');
  expect(finalLogText).toContain('[T9]');
  expect(finalLogText).toContain('[T8F]');
  expect(finalLogText).toContain('[T9F]');
  expect(finalLogText).toContain('[T3u]');
  expect(finalLogText).toContain('step 6/7: verifying watchparty tools');

  const failureSummaryChip = page.locator('.global-modal__chip--fail').filter({ hasText: /^Failed\s+[1-9]/ });
  await expect(failureSummaryChip).toHaveCount(0);

  await expect(page.getByText(`Smoke Runner: ${SMOKE_BOARD_ID}`)).toBeVisible();
});