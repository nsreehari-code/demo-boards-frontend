import { expect, test } from '@playwright/test';

async function ensureLiveTestBoard(page) {
  const boardSettingsDialog = page.locator('[role="dialog"][aria-label="Board settings"]');
  const boardSelect = page.getByTestId('board-settings-board-select');

  await expect(boardSettingsDialog).toBeVisible();
  await expect(boardSelect).toBeVisible();

  const currentBoardId = await boardSelect.inputValue();
  if (currentBoardId !== 'live-test') {
    await boardSelect.selectOption('live-test');
    await page.getByRole('button', { name: 'Save and reload' }).click();
    await expect(page.locator('[role="dialog"][aria-label="Board settings"]')).toBeHidden();
    await page.getByTestId('open-board-settings').click();
    await expect(boardSettingsDialog).toBeVisible();
    await expect(boardSelect).toHaveValue('live-test');
  }
}

test('SmokeRunner can be launched from App Config and complete warmup plus MB1 in the rendered UI', async ({ page }) => {
  test.setTimeout(15 * 60_000);

  await page.goto('/');
  await page.getByTestId('open-board-settings').click();

  await ensureLiveTestBoard(page);

  const testButton = page.getByTestId('board-settings-smoke-test-button');
  await expect(testButton).toBeEnabled();
  await testButton.click();

  await expect(page.getByText('Smoke Runner: live-test')).toBeVisible();
  await page.getByTestId('smoke-runner-run-button').click();

  const statusChip = page.getByTestId('smoke-runner-suite-status');
  const logPane = page.getByTestId('smoke-runner-log');
  const mb1Status = page.getByTestId('smoke-runner-case-status-MB1');
  await expect(statusChip).toContainText('RUNNING', { timeout: 30_000 });

  await expect(logPane).toContainText('[warmup] upserting', { timeout: 30_000 });
  await expect(logPane).toContainText('[warmup] chat queue ready', { timeout: 2 * 60_000 });
  await expect(mb1Status).toContainText('passed', { timeout: 2 * 60_000 });

  const stopButton = page.getByTestId('smoke-runner-stop-button');
  if (await stopButton.isEnabled()) {
    await stopButton.click();
    await expect(statusChip).toContainText('CANCELLED', { timeout: 30_000 });
  }

  const failureSummaryChip = page.locator('.global-modal__chip--fail').filter({ hasText: /^Failed\s+[1-9]/ });
  await expect(failureSummaryChip).toHaveCount(0);

  await expect(page.getByText('Smoke Runner: live-test')).toBeVisible();
});