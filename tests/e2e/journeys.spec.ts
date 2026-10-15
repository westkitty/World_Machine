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

  test('Journey 8: Unnecessary renderer rebuilding prevention (P005)', async ({ page }) => {
    await page.keyboard.press('Escape');

    // Baseline to medium quality to establish known reference
    await page.evaluate(() => {
      const app = (window as any).worldMachine;
      app.updateSettings({ quality: 'medium', reducedEffects: false, reducedMotion: false });
    });

    const baselineStats = await page.evaluate(() => {
      const app = (window as any).worldMachine;
      return { ...app.view.rebuildStats };
    });
    expect(baselineStats.cloudBuilds).toBeGreaterThanOrEqual(1);
    expect(baselineStats.skyBuilds).toBeGreaterThanOrEqual(1);

    // 1. Mutate a nonvisual setting (showBorders)
    await page.evaluate(() => {
      const app = (window as any).worldMachine;
      app.updateSettings({ showBorders: false });
    });

    const afterNonvisualStats = await page.evaluate(() => {
      const app = (window as any).worldMachine;
      return { ...app.view.rebuildStats };
    });
    expect(afterNonvisualStats.cloudBuilds).toBe(baselineStats.cloudBuilds);
    expect(afterNonvisualStats.skyBuilds).toBe(baselineStats.skyBuilds);
    expect(afterNonvisualStats.planetMeshBuilds).toBe(baselineStats.planetMeshBuilds);

    // 2. Toggle reduced motion (twinkle-only uniform update without rebuilding sky/clouds)
    await page.evaluate(() => {
      const app = (window as any).worldMachine;
      app.updateSettings({ reducedMotion: true });
    });

    const afterMotionStats = await page.evaluate(() => {
      const app = (window as any).worldMachine;
      return { ...app.view.rebuildStats };
    });
    expect(afterMotionStats.cloudBuilds).toBe(baselineStats.cloudBuilds);
    expect(afterMotionStats.skyBuilds).toBe(baselineStats.skyBuilds);
    expect(afterMotionStats.planetMeshBuilds).toBe(baselineStats.planetMeshBuilds);

    // 3. Elevate quality from medium to high (rebuilds clouds at 1024, stars at 3200, mesh at level 6)
    await page.evaluate(() => {
      const app = (window as any).worldMachine;
      app.updateSettings({ quality: 'high' });
    });

    const afterHighStats = await page.evaluate(() => {
      const app = (window as any).worldMachine;
      return { ...app.view.rebuildStats };
    });
    expect(afterHighStats.cloudBuilds).toBe(baselineStats.cloudBuilds + 1);
    expect(afterHighStats.skyBuilds).toBe(baselineStats.skyBuilds + 1);
    expect(afterHighStats.planetMeshBuilds).toBe(baselineStats.planetMeshBuilds + 1);
  });

  test('Journey 9: Nonblocking strategy comparison with Web Worker, progress, cancellation, and stale discard (P006)', async ({ page }) => {
    test.setTimeout(60000);
    await page.keyboard.press('Escape');

    // 1. Ensure drawer is open, then open Compare tab
    await page.evaluate(() => {
      const app = (window as any).worldMachine;
      app.hud.setDrawer(true);
    });

    await page.locator('button.tab[title="Compare"]').click();
    await expect(page.locator('h2:has-text("Fork the future")')).toBeVisible();

    // 2. Select 10 years horizon and run comparison
    await page.locator('select[aria-label="Years to simulate"]').selectOption('10');
    const runBtn = page.locator('button:has-text("Run comparison")');
    await runBtn.click();

    // 3. Table and fork semantics appear upon worker completion
    await expect(page.locator('.callout:has-text("Fork semantics")')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('table.data')).toBeVisible();

    // Adoption buttons initially enabled for the matching world tick
    const adoptA = page.locator('button:has-text("Adopt A")');
    await expect(adoptA).toBeEnabled();

    // 4. Test cancellation and state reset
    const cancelWorked = await page.evaluate(() => {
      const app = (window as any).worldMachine;
      app.forecast.start(app.state, { extraction: 'restrained' }, { extraction: 'intensive' }, 120);
      const wasRunning = app.forecast.getState().status === 'running';
      app.forecast.cancel();
      const isIdle = app.forecast.getState().status === 'idle';
      app.hud.refresh(true);
      return wasRunning && isIdle;
    });
    expect(cancelWorked).toBe(true);
    await expect(runBtn).toBeVisible();

    // 5. Re-run comparison to test staleness
    await runBtn.click();
    await expect(page.locator('.callout:has-text("Fork semantics")')).toBeVisible({ timeout: 25000 });
    await expect(adoptA).toBeEnabled();

    // 6. Advance the world clock by stepping: forecast must become stale and adoption must disable
    await page.evaluate(() => {
      const app = (window as any).worldMachine;
      app.stepOnce();
      app.hud.refresh(true);
    });

    // Stale message appears in compare panel and adoption is disabled
    await expect(page.locator('text=The active world has advanced or changed')).toBeVisible({ timeout: 5000 });
    await expect(adoptA).toBeDisabled();
  });
});

