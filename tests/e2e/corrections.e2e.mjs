/**
 * Regression tests for the Phase 1 corrections:
 * browser Back/Forward protection, orientation-gizmo view sync, responsive workspace.
 */
import { assert, canvasStats, createProject, createSuite, launch, SHOTS, startServer, waitForSettledView } from './helpers.mjs';

const suite = createSuite('corrections');
const server = await startServer(4182);
const BASE = server.url;
let ok = false;

try {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  suite.watch(page);
  console.log('\nPhase 1 corrections\n');

  // ── Browser navigation protection ──────────────────────────────────────────
  await page.goto(BASE);
  await createProject(page, BASE, 'explorer-bot', 'Nav Guard Bot');
  const workspaceUrl = page.url();

  const makeDirty = async (value) => {
    await page.getByRole('tab', { name: /Objects/ }).click();
    await page.getByTestId('objects-panel').getByRole('button', { name: 'Chassis', exact: true }).click();
    await page.getByTestId('pos-x').fill(String(value));
    await page.getByTestId('pos-x').press('Enter');
    await page.getByTestId('save-state').getByText('Unsaved changes').waitFor();
  };

  await step('Browser Back with unsaved changes shows the dialog; Cancel stays', async () => {
    await makeDirty(0.3);
    await page.goBack();
    await page.getByRole('dialog', { name: 'Unsaved changes' }).waitFor();
    for (const label of ['Save and leave', 'Discard changes and leave', 'Cancel']) {
      await page.getByRole('dialog').getByRole('button', { name: label }).waitFor();
    }
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('dialog', { name: 'Unsaved changes' }).waitFor({ state: 'detached' });
    assert(page.url() === workspaceUrl, `URL changed to ${page.url()}`);
    assert((await page.getByTestId('pos-x').inputValue()) === '0.3', 'unsaved edit lost after Cancel');
    assert((await page.getByRole('dialog').count()) === 0, 'duplicate dialog');
  });

  await step('Browser Back -> Discard changes leaves without saving', async () => {
    await page.goBack();
    await page.getByRole('dialog', { name: 'Unsaved changes' }).waitFor();
    await page.getByRole('button', { name: 'Discard changes and leave' }).click();
    await page.getByRole('heading', { name: 'Create a new robot' }).waitFor();
  });

  await step('Browser Forward returns to the workspace with the discarded edit gone', async () => {
    await page.goForward();
    await page.getByTestId('workspace').waitFor();
    await page.getByRole('tab', { name: /Objects/ }).click();
    await page.getByTestId('objects-panel').getByRole('button', { name: 'Chassis', exact: true }).click();
    assert((await page.getByTestId('pos-x').inputValue()) === '0', `expected 0, got ${await page.getByTestId('pos-x').inputValue()}`);
  });

  await step('Browser Back -> Save and leave keeps the edit', async () => {
    await makeDirty(0.25);
    await page.goBack();
    await page.getByRole('button', { name: 'Save and leave' }).click();
    await page.getByRole('heading', { name: 'Create a new robot' }).waitFor();
    await page.goForward();
    await page.getByTestId('workspace').waitFor();
    await page.getByRole('tab', { name: /Objects/ }).click();
    await page.getByTestId('objects-panel').getByRole('button', { name: 'Chassis', exact: true }).click();
    assert((await page.getByTestId('pos-x').inputValue()) === '0.25', 'saved edit missing');
  });

  await step('Browser Forward is also protected when there are unsaved changes', async () => {
    // Build a forward history entry: workspace -> templates page (clean) -> back to workspace.
    await page.getByRole('tab', { name: 'Templates' }).click();
    await page.getByTestId('templates-panel').getByRole('button').first().click();
    await page.getByRole('heading', { name: 'Create a new robot' }).waitFor();
    await page.goBack();
    await page.getByTestId('workspace').waitFor();
    await makeDirty(0.4);
    await page.goForward();
    await page.getByRole('dialog', { name: 'Unsaved changes' }).waitFor();
    await page.getByRole('button', { name: 'Cancel' }).click();
    assert(page.url() === workspaceUrl, 'left the workspace on forward');
  });

  await step('Tab close / reload protection (beforeunload) is still registered', async () => {
    const prevented = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert(prevented, 'beforeunload did not prevent default while dirty');
  });

  await step('In-app back arrow uses the same single dialog', async () => {
    await page.getByRole('button', { name: 'Back to dashboard' }).click();
    await page.getByRole('dialog', { name: 'Unsaved changes' }).waitFor();
    assert((await page.getByRole('dialog').count()) === 1, 'more than one dialog');
    await page.getByRole('button', { name: 'Save and leave' }).click();
    await page.getByRole('heading', { name: 'Build. Code. Simulate. Innovate.' }).waitFor();
  });

  // ── Orientation gizmo synchronization ─────────────────────────────────────
  await createProject(page, BASE, 'explorer-bot', 'Gizmo Sync Bot');
  const canvas = page.locator('[data-testid="viewport"] canvas');
  const box = await canvas.boundingBox();
  const gizmo = { x: box.x + box.width - 64, y: box.y + box.height - 64 };

  await step('Toolbar views and the settled label agree', async () => {
    await page.getByRole('button', { name: 'Front', exact: true }).click();
    await waitForSettledView(page, 'Front view');
    await page.waitForTimeout(600);
    await waitForSettledView(page, 'Front view');
  });

  await step('Clicking the gizmo Y axis switches the label to Top view', async () => {
    await page.mouse.click(gizmo.x, gizmo.y - 40);
    await waitForSettledView(page, 'Top view');
    await page.screenshot({ path: `${SHOTS}/c1-gizmo-top.png` });
  });

  await step('Clicking the gizmo X axis switches the label to Right view', async () => {
    await page.mouse.click(gizmo.x + 40, gizmo.y);
    await waitForSettledView(page, 'Right view');
  });

  await step('Orbiting to a non-standard angle shows Custom view', async () => {
    const cx = box.x + box.width * 0.3;
    const cy = box.y + box.height * 0.3;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 90, cy + 35, { steps: 6 });
    await page.mouse.up();
    await waitForSettledView(page, 'Custom view');
    assert((await page.getByRole('button', { name: 'Right', exact: true }).getAttribute('aria-pressed')) === 'false', 'toolbar still shows Right');
  });

  await step('A toolbar view after the gizmo is still recognized', async () => {
    await page.getByRole('button', { name: 'Perspective', exact: true }).click();
    await waitForSettledView(page, 'Perspective view');
  });

  // ── Responsive workspace ───────────────────────────────────────────────────
  await step('At 1440 px the desktop layout is unchanged (panels inline)', async () => {
    assert((await page.getByTestId('workspace').getAttribute('data-compact')) === 'false', 'desktop flagged compact');
    await page.getByTestId('left-panel').waitFor();
    await page.getByTestId('right-panel').waitFor();
    assert((await page.getByTestId('left-drawer').count()) === 0, 'drawer on desktop');
  });

  for (const [width, height] of [
    [900, 700],
    [600, 800],
  ]) {
    await step(`At ${width} px side panels start closed and open as drawers over the viewport`, async () => {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(500);
      assert((await page.getByTestId('workspace').getAttribute('data-compact')) === 'true', 'not compact');
      await page.getByTestId('left-panel-collapsed').waitFor();
      await page.getByTestId('right-panel-collapsed').waitFor();
      const before = (await canvas.boundingBox()).width;
      await page.getByRole('button', { name: 'Expand left panel' }).click();
      await page.getByTestId('left-drawer').waitFor();
      await page.waitForTimeout(300);
      const after = (await canvas.boundingBox()).width;
      assert(Math.abs(after - before) < 2, `viewport resized under the drawer (${before} -> ${after})`);
      await page.screenshot({ path: `${SHOTS}/c2-drawer-${width}.png` });
      await page.getByTestId('left-drawer-backdrop').click({ position: { x: width - 30, y: 300 } });
      await page.getByTestId('left-drawer').waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Expand properties panel' }).click();
      await page.getByTestId('right-drawer').waitFor();
      await page.getByTestId('right-drawer-backdrop').click({ position: { x: 20, y: 300 } });
    });

    await step(`At ${width} px nothing overflows horizontally and toolbars do not overlap`, async () => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 0, `page overflows by ${overflow}px`);
      const vp = await page.getByTestId('viewport').boundingBox();
      const tools = await page.getByTestId('view-buttons').boundingBox();
      assert(tools.x >= vp.x - 1 && tools.x + tools.width <= vp.x + vp.width + 1, 'view buttons outside the viewport');
      const topbar = await page.getByTestId('workspace-topbar').boundingBox();
      const save = await page.getByTestId('save').boundingBox();
      assert(save.x + save.width <= topbar.x + topbar.width + 1, 'Save button cut off');
      const stats = await canvasStats(page);
      assert(stats.distinct > 40, 'viewport blank');
      await page.screenshot({ path: `${SHOTS}/c3-compact-${width}.png` });
    });
  }

  await step('The small-screen banner is shown below 768 px and can be dismissed', async () => {
    await page.getByTestId('small-screen-banner').waitFor();
    await page.getByTestId('small-screen-banner').getByRole('button', { name: 'Dismiss' }).click();
    await page.getByTestId('small-screen-banner').waitFor({ state: 'detached' });
  });

  await step('Back at 1440 px the layout restores', async () => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(400);
    assert((await page.getByTestId('workspace').getAttribute('data-compact')) === 'false', 'still compact');
    await page.getByRole('button', { name: 'Expand left panel' }).click();
    await page.getByTestId('left-panel').waitFor();
    assert((await page.getByTestId('left-drawer').count()) === 0, 'drawer on desktop');
  });

  await step('No browser console errors', async () => {
    assert(suite.consoleErrors.length === 0, `console errors:\n${suite.consoleErrors.join('\n')}`);
  });

  await browser.close();
  ok = suite.summary();
} catch (error) {
  console.error('Suite crashed:', error);
} finally {
  server.stop();
  process.exit(ok ? 0 : 1);
}

async function step(name, fn) {
  return suite.step(name, fn);
}
