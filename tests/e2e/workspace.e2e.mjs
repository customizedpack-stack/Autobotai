/**
 * End-to-end check of the Phase 1 user journey in a real (headless) Chrome.
 *
 * Usage: npm run build && npm run test:e2e
 * Env:   CHROME_PATH=/path/to/chrome (optional; defaults to Playwright's Chromium or /usr/bin/google-chrome)
 *
 * The test fails on any failed step and on any browser console error.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 4179;
const BASE = `http://localhost:${PORT}`;
const SHOTS = 'tests/e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

const results = [];
const consoleErrors = [];

async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.message ?? error) });
    if (globalThis.__page) await globalThis.__page.screenshot({ path: `${SHOTS}/fail-${results.length}.png` }).catch(() => {});
    console.log(`  FAIL  ${name}\n        ${String(error?.message ?? error).split('\n')[0]}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Preview server did not start');
}

/** Rough check that the WebGL canvas drew a real scene (not a blank color). */
async function canvasStats(page) {
  return page.evaluate(() => {
    const src = document.querySelector('[data-testid="viewport"] canvas');
    if (!src) return { found: false, distinct: 0, width: 0 };
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 64;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const colors = new Set();
    for (let i = 0; i < data.length; i += 4) colors.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`);
    return { found: true, distinct: colors.size, width: src.width, signature: c.toDataURL().slice(-200) };
  });
}

// Own process group, so the cleanup below ends the Vite server itself and not only the npx wrapper.
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
let exitCode = 1;

try {
  await waitForServer(BASE);
  const executablePath = process.env.CHROME_PATH ?? (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
  const browser = await chromium.launch({
    executablePath,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  globalThis.__page = page;
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`${msg.text()} @ ${JSON.stringify(msg.location())} args=${msg.args().length}`);
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

  console.log('\nPhase 1 end-to-end journey\n');

  await step('Dashboard loads with empty state and templates', async () => {
    await page.goto(BASE);
    await page.getByRole('heading', { name: 'Build. Code. Simulate. Innovate.' }).waitFor();
    await page.getByText('No robots yet').waitFor();
    for (const name of ['Explorer Bot', 'Robotic Arm', 'Humanoid Robot', 'Quadcopter Drone']) {
      await page.getByRole('link', { name: `Start a new robot from the ${name} template` }).waitFor();
    }
    await page.screenshot({ path: `${SHOTS}/01-dashboard-empty.png` });
  });

  await step('Navigate dashboard -> projects -> dashboard', async () => {
    await page.getByRole('link', { name: 'My Projects' }).click();
    await page.getByRole('heading', { name: 'My Projects' }).waitFor();
    await page.getByRole('link', { name: 'Dashboard' }).click();
    await page.getByRole('heading', { name: 'Build. Code. Simulate. Innovate.' }).waitFor();
  });

  await step('Create robot: choose category, template and name', async () => {
    await page.getByRole('button', { name: 'Create New Robot' }).click();
    await page.getByRole('heading', { name: 'Create a new robot' }).waitFor();
    await page.getByRole('button', { name: /^Robotic Arm/ }).click();
    assert((await page.getByLabel('Robot name').inputValue()) === 'My Robotic Arm', 'name did not follow template');
    await page.getByRole('button', { name: /^Mobile Robot/ }).click();
    await page.getByRole('button', { name: /^Explorer Bot/ }).click();
    await page.getByLabel('Robot name').fill('');
    await page.getByText('Enter a robot name.').waitFor();
    assert(await page.getByRole('button', { name: 'Create Workspace' }).isDisabled(), 'create allowed with empty name');
    await page.getByLabel('Robot name').fill('E2E Explorer');
    await page.screenshot({ path: `${SHOTS}/02-create-robot.png` });
    await page.getByRole('button', { name: 'Create Workspace' }).click();
    await page.getByTestId('workspace').waitFor();
  });

  await step('Workspace shows project name and all panels', async () => {
    assert((await page.getByTestId('project-name').inputValue()) === 'E2E Explorer', 'project name mismatch');
    for (const id of ['left-panel', 'right-panel', 'bottom-panel', 'status-bar', 'view-buttons']) {
      await page.getByTestId(id).waitFor();
    }
  });

  let initialSignature = '';
  await step('3D viewport renders a real WebGL scene', async () => {
    await page.waitForTimeout(1500);
    const stats = await canvasStats(page);
    assert(stats.found, 'no canvas');
    assert(stats.width > 300, `canvas too small (${stats.width})`);
    assert(stats.distinct > 40, `canvas looks blank (${stats.distinct} colors)`);
    initialSignature = stats.signature;
    await page.screenshot({ path: `${SHOTS}/03-workspace.png` });
  });

  const canvas = page.locator('[data-testid="viewport"] canvas');
  const box = await canvas.boundingBox();

  await step('Orbit, pan and zoom change the camera', async () => {
    const cx = box.x + box.width * 0.7;
    const cy = box.y + box.height * 0.75;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 120, cy - 40, { steps: 8 });
    await page.mouse.up();
    await page.getByTestId('active-view').getByText(/Custom view/).waitFor();
    await page.waitForTimeout(400);
    const orbited = (await canvasStats(page)).signature;
    assert(orbited !== initialSignature, 'orbit did not change the image');
    await page.mouse.move(cx, cy);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(cx - 60, cy + 20, { steps: 6 });
    await page.mouse.up({ button: 'right' });
    await page.mouse.wheel(0, -400);
    await page.waitForTimeout(400);
    const moved = (await canvasStats(page)).signature;
    assert(moved !== orbited, 'pan/zoom did not change the image');
  });

  await step('Camera view buttons change the view', async () => {
    const signatures = new Set();
    for (const view of ['Front', 'Back', 'Left', 'Right', 'Top', 'Perspective']) {
      await page.getByRole('button', { name: view, exact: true }).click();
      await page.waitForTimeout(700);
      const pressed = await page.getByRole('button', { name: view, exact: true }).getAttribute('aria-pressed');
      assert(pressed === 'true', `${view} not marked active`);
      await page.getByTestId('active-view').getByText(`${view} view`).waitFor();
      signatures.add((await canvasStats(page)).signature);
      if (view === 'Front' || view === 'Top') await page.screenshot({ path: `${SHOTS}/04-view-${view.toLowerCase()}.png` });
    }
    assert(signatures.size >= 5, `views did not produce distinct images (${signatures.size})`);
  });

  await step('Keyboard shortcut switches view (key 6 = Top)', async () => {
    await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press('6');
    await page.getByTestId('active-view').getByText('Top view').waitFor();
    await page.keyboard.press('1');
    await page.waitForTimeout(600);
  });

  await step('Select object by clicking it in the 3D viewport', async () => {
    await page.getByRole('button', { name: 'Front', exact: true }).click();
    await page.waitForTimeout(700);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.getByTestId('object-inspector').waitFor({ timeout: 3000 });
    const name = await page.getByTestId('inspector-name').inputValue();
    assert(name.length > 0, 'inspector has no name');
    await page.screenshot({ path: `${SHOTS}/05-selected-in-viewport.png` });
  });

  await step('Select object from the Objects list and show its properties', async () => {
    await page.getByRole('tab', { name: /Objects/ }).click();
    await page.getByTestId('objects-panel').getByRole('button', { name: /^Left Wheel/ }).click();
    assert((await page.getByTestId('inspector-name').inputValue()) === 'Left Wheel', 'wrong object in inspector');
    await page.getByText('Cylinder r 0.07 m, h 0.035 m').waitFor();
  });

  let originalX = '';
  await step('Edit position, rotation and scale; undo and redo', async () => {
    originalX = await page.getByTestId('pos-x').inputValue();
    await page.getByTestId('pos-x').fill('0.5');
    await page.getByTestId('pos-x').press('Enter');
    await page.getByTestId('rot-y').fill('45');
    await page.getByTestId('rot-y').press('Enter');
    await page.getByTestId('scl-x').fill('2');
    await page.getByTestId('scl-x').press('Enter');
    await page.getByTestId('save-state').getByText('Unsaved changes').waitFor();
    assert((await page.getByTestId('pos-x').inputValue()) === '0.5', 'position not applied');
    await page.screenshot({ path: `${SHOTS}/06-transform-edited.png` });
    await page.getByTestId('undo').click();
    await page.getByTestId('undo').click();
    await page.getByTestId('undo').click();
    assert((await page.getByTestId('pos-x').inputValue()) === originalX, 'undo did not restore position');
    await page.getByTestId('redo').click();
    assert((await page.getByTestId('pos-x').inputValue()) === '0.5', 'redo did not reapply position');
  });

  await step('Rename object in the inspector', async () => {
    await page.getByTestId('inspector-name').fill('Main Left Wheel');
    await page.getByTestId('inspector-name').press('Enter');
    await page.getByTestId('objects-panel').getByRole('button', { name: /^Main Left Wheel/ }).waitFor();
  });

  await step('Add a component from the library', async () => {
    await page.getByRole('tab', { name: 'Components' }).click();
    await page.getByLabel('Search components').fill('lidar');
    await page.getByTestId('component-sensor-lidar').click();
    assert((await page.getByTestId('inspector-name').inputValue()) === 'Lidar', 'added component not selected');
    await page.getByLabel('Search components').fill('');
  });

  await step('Console shows messages and bus events', async () => {
    await page.getByTestId('console-log').getByText(/Added "Lidar"/).waitFor();
    await page.getByRole('tab', { name: /Bus Events/ }).click();
    await page.getByTestId('events-log').getByText('scene.changed').first().waitFor();
    await page.getByRole('tab', { name: /Status/ }).click();
    await page.getByTestId('status-view').getByText('Rapier 0.21 · stopped').waitFor();
    await page.screenshot({ path: `${SHOTS}/07-status-panel.png` });
    await page.getByRole('tab', { name: /Console/ }).click();
  });

  await step('Collapse and expand left, right and bottom panels', async () => {
    await page.getByRole('button', { name: 'Collapse left panel' }).click();
    await page.getByTestId('left-panel-collapsed').waitFor();
    await page.getByRole('button', { name: 'Collapse properties panel' }).click();
    await page.getByTestId('right-panel-collapsed').waitFor();
    await page.getByRole('button', { name: 'Collapse console panel' }).click();
    await page.getByTestId('bottom-panel-collapsed').waitFor();
    await page.waitForTimeout(1200);
    const stats = await canvasStats(page);
    assert(stats.distinct > 40, `viewport blank after collapsing panels (${stats.distinct})`);
    await page.screenshot({ path: `${SHOTS}/08-panels-collapsed.png` });
    await page.getByRole('button', { name: 'Expand left panel' }).click();
    await page.getByRole('button', { name: 'Expand properties panel' }).click();
    await page.getByRole('button', { name: 'Expand console panel' }).click();
    await page.getByTestId('left-panel').waitFor();
    await page.getByTestId('right-panel').waitFor();
    await page.getByTestId('bottom-panel').waitFor();
  });

  await step('Save local draft and survive a page reload', async () => {
    await page.getByTestId('save').click();
    await page.getByTestId('save-state').getByText(/Saved/).waitFor();
    await page.reload();
    await page.getByTestId('workspace').waitFor();
    await page.getByRole('tab', { name: /Objects/ }).click();
    await page.getByTestId('objects-panel').getByRole('button', { name: /^Main Left Wheel/ }).waitFor();
    await page.getByTestId('objects-panel').getByRole('button', { name: /^Lidar/ }).waitFor();
  });

  await step('Unsaved-changes guard when leaving, then Save and leave', async () => {
    await page.getByTestId('project-name').fill('E2E Explorer v2');
    await page.getByTestId('project-name').press('Enter');
    await page.getByRole('button', { name: 'Back to dashboard' }).click();
    await page.getByRole('dialog', { name: 'Unsaved changes' }).waitFor();
    await page.getByRole('button', { name: 'Save and leave' }).click();
    await page.getByRole('heading', { name: 'Build. Code. Simulate. Innovate.' }).waitFor();
    await page.getByRole('link', { name: 'Open E2E Explorer v2' }).waitFor();
    await page.screenshot({ path: `${SHOTS}/09-dashboard-with-project.png` });
  });

  await step('Reopen the project from the dashboard', async () => {
    await page.getByRole('link', { name: 'Open E2E Explorer v2' }).click();
    await page.getByTestId('workspace').waitFor();
    assert((await page.getByTestId('project-name').inputValue()) === 'E2E Explorer v2', 'renamed project not reopened');
  });

  await step('Other templates open in the workspace (Arm, Humanoid, Drone)', async () => {
    for (const [template, file] of [
      ['robotic-arm', 'arm'],
      ['humanoid', 'humanoid'],
      ['quadcopter', 'drone'],
    ]) {
      await page.goto(`${BASE}/new?template=${template}`);
      await page.getByRole('button', { name: 'Create Workspace' }).click();
      await page.getByTestId('workspace').waitFor();
      await page.waitForTimeout(1200);
      const stats = await canvasStats(page);
      assert(stats.distinct > 40, `${template} rendered blank`);
      await page.screenshot({ path: `${SHOTS}/10-template-${file}.png` });
    }
  });

  await step('Unknown project shows a not-found page', async () => {
    await page.goto(`${BASE}/workspace/prj_missing`);
    await page.getByText('This project was not found in this browser.', { exact: false }).waitFor();
  });

  await step('No browser console errors during the journey', async () => {
    console.log(JSON.stringify(consoleErrors, null, 1).slice(0, 3000));
    assert(consoleErrors.length === 0, `console errors: ${consoleErrors.length}`);
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  exitCode = failed.length === 0 ? 0 : 1;
} catch (error) {
  console.error('E2E run crashed:', error);
} finally {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    server.kill();
  }
  process.exit(exitCode);
}
