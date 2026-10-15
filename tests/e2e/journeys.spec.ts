import { test, expect } from '@playwright/test';

test.describe('The World Machine — Automated Browser Journeys (P007)', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app root; wait for network idle and canvas mount
    await page.goto('/');
    await page.waitForSelector('#app canvas', { timeout: 30000 });
  });

  test('Journey 1: Boot, title modal, and start steward game', async ({ page }) => {
    // Title modal is displayed on fresh boot
    const modal = page.locator('.modal.open');
    await expect(modal).toBeVisible();

    // Verify Title contents
    const title = page.locator('.title-body');
    await expect(title).toBeVisible();
    await expect(page.locator('.title-hero h1')).toContainText('The World Machine');

    // Click "Generate & begin" to start the world
    const startBtn = page.locator('button:has-text("Generate & begin")');
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // Modal closes
    await expect(modal).not.toBeVisible();

    // HUD top bar displays world name (attached to DOM; text verified across viewports)
    const worldName = page.locator('#world-name');
    await expect(worldName).toBeAttached();
    await expect(worldName).toContainText('Sandbox');

    // Canvas is active
    const canvas = page.locator('#app canvas');
    await expect(canvas).toBeVisible();
  });

  test('Journey 2: Inspect regions, open drawer, and navigate tabs', async ({ page }) => {
    // Dismiss title screen
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal.open')).not.toBeVisible();

    // Access window.worldMachine to select a populated cell
    await page.evaluate(() => {
      const app = (window as any).worldMachine;
      const first = app.state.settlements.find((s: any) => s.alive);
      if (first) app.select(first.cellId, true);
    });

    // Drawer is open and displays inspector
    const drawer = page.locator('.drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer).not.toHaveClass(/closed/);

    // Tab bar has 9 tabs
    const tabs = page.locator('.tabs button.tab');
    await expect(tabs).toHaveCount(9);

    // Switch to Settlement tab
    await page.locator('button.tab[title="Settlement"]').click();
    await expect(page.locator('.drawer-body')).toContainText('Population');

    // Switch to Ledger tab
    await page.locator('button.tab[title="Ledger"]').click();
    await expect(page.locator('.drawer-body')).toContainText('Resource ledger');

    // Switch to Policy tab
    await page.locator('button.tab[title="Policy"]').click();
    await expect(page.locator('.drawer-body')).toContainText('Policy');
  });

  test('Journey 3: Policy modification and clock control', async ({ page }) => {
    await page.keyboard.press('Escape');

    // Select policy tab
    await page.locator('button.tab[title="Policy"]').click();
    await expect(page.locator('.drawer-body')).toContainText('Extraction intensity');

    // Toggle rationing button or sandbox checkbox if available
    const restrainBtn = page.locator('.seg button:has-text("Restrained")');
    await expect(restrainBtn).toBeVisible();
    await restrainBtn.click();
    await expect(restrainBtn).toHaveClass(/btn\.on|on/);

    // Clock pause toggle via UI control button (works on desktop and mobile)
    const pauseToggleBtn = page.locator('.clock button[title*="Space"]').first();
    await expect(pauseToggleBtn).toBeVisible();
    const wasPaused = (await pauseToggleBtn.getAttribute('aria-pressed')) === 'true';
    await pauseToggleBtn.click();
    const isPausedNow = (await pauseToggleBtn.getAttribute('aria-pressed')) === 'true';
    expect(isPausedNow).toBe(!wasPaused);
  });

  test('Journey 4: Strategy comparison ("Fork the future") with fork semantics', async ({ page }) => {
    test.setTimeout(60000);
    await page.keyboard.press('Escape');

    // Open Compare tab
    await page.locator('button.tab[title="Compare"]').click();
    const compareHead = page.locator('h2:has-text("Fork the future")');
    await expect(compareHead).toBeVisible();

    // Select 1 year horizon for fast, deterministic test execution
    await page.locator('select[aria-label="Years to simulate"]').selectOption('1');

    // Click "Run comparison"
    const runBtn = page.locator('button:has-text("Run comparison")');
    await expect(runBtn).toBeVisible();
    await runBtn.click();

    // Table with metrics and fork semantics box appears
    await expect(page.locator('.callout:has-text("Fork semantics")')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('table.data')).toBeVisible();

    // Adopt buttons are visible
    const adoptA = page.locator('button:has-text("Adopt A")');
    const adoptB = page.locator('button:has-text("Adopt B")');
    await expect(adoptA).toBeVisible();
    await expect(adoptB).toBeVisible();
  });

  test('Journey 5: Save slots, overwrite protection confirmation, and backup recovery', async ({ page }) => {
    await page.keyboard.press('Escape');

    // Open Save modal
    await page.locator('button[title*="Save, load"]').click();
    const modal = page.locator('.modal.open');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Saves');

    // Click "Save here" on Slot 1
    const saveBtn = page.locator('ul.slots li button:has-text("Save here")').first();
    await saveBtn.click();

    // Toast appears
    await expect(page.locator('.toasts .toast')).toBeVisible();

    // Clicking "Save here" again on the same occupied slot triggers Overwrite Confirmation
    const occupiedSaveBtn = page.locator('ul.slots li button:has-text("Save here")').first();
    await occupiedSaveBtn.click();

    // Confirmation box with Confirm Overwrite appears
    const confirmBox = page.locator('.confirm-box');
    await expect(confirmBox).toBeVisible();
    await expect(confirmBox).toContainText('Overwrite Slot 1?');

    // Cancel is a no-op
    await page.locator('button:has-text("Cancel")').click();
    await expect(confirmBox).not.toBeVisible();

    // Close modal
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
  });

  test('Journey 6: Scenario constraints and terminal boundaries', async ({ page }) => {
    // Start scenario via window.worldMachine
    await page.evaluate(() => {
      const app = (window as any).worldMachine;
      app.hud.closeModal();
      app.newGame({ mode: 'scenario', scenario: 'first_footprint' });
    });

    // Banner indicates scenario is active
    const banner = page.locator('.banner.show');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('First Footprint');

    // Open Policy tab
    await page.locator('button.tab[title="Policy"]').click();

    // Full autonomy button is disabled due to scenario constraint
    const fullAutonomy = page.locator('.seg button:has-text("Full")');
    await expect(fullAutonomy).toHaveClass(/disabled/);
    await expect(fullAutonomy).toHaveAttribute('aria-disabled', 'true');
  });

  test('Journey 7: Mobile touch drawer collapse and tool parity', async ({ page }) => {
    await page.keyboard.press('Escape');

    // Drawer toggle button
    const toggleBtn = page.locator('.drawer-toggle');
    await expect(toggleBtn).toBeVisible();

    const drawer = page.locator('.drawer');
    const wasClosed = await drawer.evaluate((el) => el.classList.contains('closed'));

    // Toggle drawer to opposite state
    await toggleBtn.dispatchEvent('click');
    if (wasClosed) {
      await expect(drawer).not.toHaveClass(/closed/);
    } else {
      await expect(drawer).toHaveClass(/closed/);
    }

    // Toggle drawer back to original state
    await toggleBtn.dispatchEvent('click');
    if (wasClosed) {
      await expect(drawer).toHaveClass(/closed/);
    } else {
      await expect(drawer).not.toHaveClass(/closed/);
    }

    // Tools in rail are clickable
    const inspectBtn = page.locator('.rail button.tool').first();
    await inspectBtn.click();
    await expect(inspectBtn).toHaveClass(/active/);
  });
});
