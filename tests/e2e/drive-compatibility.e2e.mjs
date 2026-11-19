/**
 * Drive compatibility fix in a real browser (Part A). The user's case: an Explorer Bot saved in
 * Phase 1 (no joints, flat parts), stored today as the old migration left it. Workflow: open it →
 * Control → Set up differential drive → W/A/S/D move the robot. Also: physics, save/reload, a
 * fresh Explorer Bot, and a robot that cannot be repaired safely (guided message, no change).
 * Screenshots: docs/testing/drive-compatibility/.
 */
import { mkdirSync } from 'node:fs';
import { assert, createProject, createSuite, launch, startServer } from './helpers.mjs';

const SHOTS = 'docs/testing/drive-compatibility';
mkdirSync(SHOTS, { recursive: true });
const suite = createSuite('drive-compatibility');
const step = (name, fn) => suite.step(name, fn);
const server = await startServer(4196);
const BASE = server.url;
let ok = false;

const HALF_PI = Math.PI / 2;
const CREATED = '2026-08-20T09:00:00.000Z';
/** Phase 1 Explorer Bot parts (commit f163ce8, verbatim). */
const PHASE1_PARTS = [
    { name: 'Chassis', category: 'chassis', componentId: 'chassis-rect', description: 'Main frame of Explorer Bot.', geometry: { shape: 'box', size: [0.4, 0.1, 0.26] }, color: '#3B82F6', transform: { position: [0, 0.11, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Top Plate', category: 'body', componentId: 'body-plate', description: 'Mounting deck.', geometry: { shape: 'box', size: [0.34, 0.015, 0.22] }, color: '#334155', transform: { position: [-0.02, 0.17, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Left Wheel', category: 'wheel', componentId: 'wheel-standard', description: 'Left drive wheel.', geometry: { shape: 'cylinder', radius: 0.07, height: 0.035 }, color: '#2F3A4C', transform: { position: [0.06, 0.07, 0.155], rotation: [HALF_PI, 0, 0], scale: [1, 1, 1] } },
    { name: 'Right Wheel', category: 'wheel', componentId: 'wheel-standard', description: 'Right drive wheel.', geometry: { shape: 'cylinder', radius: 0.07, height: 0.035 }, color: '#2F3A4C', transform: { position: [0.06, 0.07, -0.155], rotation: [HALF_PI, 0, 0], scale: [1, 1, 1] } },
    { name: 'Left Motor', category: 'motor', componentId: 'motor-dc', description: 'Drives the left wheel.', geometry: { shape: 'cylinder', radius: 0.02, height: 0.07 }, color: '#F59E0B', transform: { position: [0.06, 0.07, 0.09], rotation: [HALF_PI, 0, 0], scale: [1, 1, 1] } },
    { name: 'Right Motor', category: 'motor', componentId: 'motor-dc', description: 'Drives the right wheel.', geometry: { shape: 'cylinder', radius: 0.02, height: 0.07 }, color: '#F59E0B', transform: { position: [0.06, 0.07, -0.09], rotation: [HALF_PI, 0, 0], scale: [1, 1, 1] } },
    { name: 'Caster Ball', category: 'wheel', componentId: 'wheel-caster', description: 'Rear support.', geometry: { shape: 'sphere', radius: 0.03 }, color: '#94A3B8', transform: { position: [-0.15, 0.03, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Distance Sensor', category: 'sensor', componentId: 'sensor-distance', description: 'Front range finder for obstacle detection.', geometry: { shape: 'box', size: [0.03, 0.03, 0.06] }, color: '#22C55E', transform: { position: [0.215, 0.13, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    { name: 'Controller Board', category: 'other', componentId: 'other-controller', description: 'Runs the robot program.', geometry: { shape: 'box', size: [0.07, 0.01, 0.05] }, color: '#0EA5E9', transform: { position: [-0.06, 0.183, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
];
const phase1Objects = () =>
  PHASE1_PARTS.map((d) => ({
    id: `obj_p1_${d.name.toLowerCase().replace(/ /g, '-')}`,
    name: d.name, category: d.category, geometry: d.geometry, color: d.color, transform: d.transform,
    visible: true, parentId: null, metadata: { componentId: d.componentId ?? null, description: d.description ?? '', createdAt: CREATED },
  }));
/** As stored after the old migration: schema v3, flat, no joints, no drive. */
const legacy = (id, name, objects = phase1Objects()) => ({ id, name, category: 'mobile', templateId: 'explorer-bot', schemaVersion: 3, objects, joints: [], actuators: [], controllers: [], createdAt: CREATED, updatedAt: CREATED, savedAt: CREATED });

try {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    window.__ARAI_E2E__ = true;
  });
  const page = await context.newPage();
  suite.watch(page);
  console.log('\nDrive compatibility fix\n');

  const text = (id) => page.getByTestId(id).textContent();
  const position = async () => (await text('telemetry-position')).split(',').map(Number);
  const heading = async () => Number.parseFloat(await text('telemetry-heading'));
  const focusWorkspace = () => page.getByTestId('status-bar').click();
  const hold = async (keys, ms) => {
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(ms);
    for (const k of [...keys].reverse()) await page.keyboard.up(k);
    await page.waitForTimeout(200);
  };
  const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
  const openStored = async (project) => {
    await page.goto(BASE);
    await page.evaluate((p) => {
      localStorage.setItem('arai.projects.v1', JSON.stringify({ state: { projects: { [p.id]: p } }, version: 3 }));
    }, project);
    await page.goto(`${BASE}/workspace/${project.id}`);
    await page.getByTestId('workspace').waitFor();
    await page.waitForTimeout(1000);
  };
  /** W/A/S/D: forward, turn left, back, turn right; each must change the pose. */
  const wasd = async (label) => {
    await focusWorkspace();
    const p0 = await position();
    await hold(['w'], 700);
    const p1 = await position();
    assert(p1[0] > p0[0] + 0.05, `${label}: W did not move forward (${p0} → ${p1})`);
    const h0 = await heading();
    await hold(['a'], 500);
    const h1 = await heading();
    assert(h1 > h0 + 5, `${label}: A did not turn left (${h0} → ${h1})`);
    await hold(['d'], 500);
    const h2 = await heading();
    assert(h2 < h1 - 5, `${label}: D did not turn right (${h1} → ${h2})`);
    const p2 = await position();
    await hold(['s'], 500);
    const p3 = await position();
    assert(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]) > 0.05, `${label}: S did not move back (${p2} → ${p3})`);
    return { p0, p1, p3, h0, h1, h2 };
  };

  await step('A1: the legacy "My Explorer Bot" opens in Control Mode; the guided setup lists what is missing and what Set up will do', async () => {
    await openStored(legacy('prj_legacy', 'My Explorer Bot'));
    await page.getByTestId('mode-control').click();
    const guide = page.getByTestId('setup-drive-guide');
    await guide.waitFor();
    assert((await guide.getAttribute('data-ready')) === 'false', 'should not be ready before repair');
    assert((await guide.getAttribute('data-repairable')) === 'true', 'should be repairable');
    assert((await page.getByTestId('setup-drive-check-joints').getAttribute('data-ok')) === 'false', 'joints check should fail');
    await page.getByTestId('setup-drive-repair-note').waitFor();
    await shot('01-legacy-explorer-bot-before-setup');
  });

  await step('A2: before setup, a move key is refused (no drive controller), exactly as reported', async () => {
    await focusWorkspace();
    await hold(['w'], 400);
    assert((await text('movement-status')) === 'idle', 'robot moved without a drive');
    await page.getByRole('tab', { name: /^Console/ }).click();
    const log = await page.getByTestId('console-log').innerText();
    assert(/Command "drive" rejected: This robot has no drive controller/.test(log), 'rejection message missing');
  });

  await step('A3: Set up differential drive succeeds: drive section, 2 joints, 2 motors', async () => {
    await page.getByTestId('setup-drive').click();
    await page.getByTestId('setup-drive-guide').waitFor({ state: 'detached' });
    await page.getByRole('tab', { name: /^Console/ }).click();
    const log = await page.getByTestId('console-log').innerText();
    assert(/Set up differential drive with 2 DC motor/.test(log), 'success message missing');
    assert(/Drive repair: Added 2 revolute wheel joints/.test(log), 'repair message missing');
    // The rejected W press before setup must not leave a stale red error behind.
    assert((await page.getByTestId('command-error').count()) === 0, `stale error still shown: ${await page.getByTestId('command-error').textContent().catch(() => '')}`);
    // Wheels by physical side; the legacy names keep their warning (parts are not renamed).
    assert((await page.getByTestId('drive-wheels-left').getAttribute('data-part')) === 'Right Wheel', 'left wheel label');
    assert((await page.getByTestId('drive-wheels-right').getAttribute('data-part')) === 'Left Wheel', 'right wheel label');
    const warn = await page.getByTestId('drive-wheels-warnings').innerText();
    assert(/"Right Wheel" sits on the robot's left side/.test(warn) && /"Left Wheel" sits on the robot's right side/.test(warn), 'naming warning missing');
    await page.getByTestId('drive-wheels').scrollIntoViewIfNeeded();
    await shot('02-setup-succeeded');
  });

  await step('A4: W/A/S/D drive the repaired robot (kinematic)', async () => {
    const r = await wasd('kinematic');
    console.log(`        kinematic: W x ${r.p0[0].toFixed(3)} → ${r.p1[0].toFixed(3)}; A heading ${r.h0.toFixed(1)}° → ${r.h1.toFixed(1)}°; D → ${r.h2.toFixed(1)}°`);
    await shot('03-wasd-kinematic');
  });

  await step('A5: W drives it in the Physics engine too', async () => {
    await page.getByTestId('mode-simulate').click();
    await page.locator('[data-testid="simulation-panel"][data-state="running"]').waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    await focusWorkspace();
    const p0 = await position();
    await hold(['w'], 1200);
    const p1 = await position();
    assert(p1[0] > p0[0] + 0.05, `physics: W did not move forward (${p0} → ${p1})`);
    console.log(`        physics: W x ${p0[0].toFixed(3)} → ${p1[0].toFixed(3)}`);
    await shot('04-wasd-physics');
    await page.getByTestId('sim-stop').click();
  });

  await step('A6: save, reload the browser, reopen: the drive is still there and W moves the robot', async () => {
    await page.getByTestId('mode-build').click();
    await page.getByTestId('save').click();
    await page.waitForTimeout(400);
    await page.reload();
    await page.getByTestId('workspace').waitFor();
    await page.waitForTimeout(800);
    await page.getByTestId('mode-control').click();
    assert((await page.getByTestId('setup-drive-guide').count()) === 0, 'drive lost after reload');
    await focusWorkspace();
    const p0 = await position();
    await hold(['w'], 600);
    const p1 = await position();
    assert(p1[0] > p0[0] + 0.05, 'W did not move after reload');
    await shot('05-after-reload');
  });

  await step('A7: a robot that cannot be repaired safely (one wheel): exact problem shown, nothing changes', async () => {
    await openStored(legacy('prj_onewheel', 'One Wheel Bot', phase1Objects().filter((o) => o.name !== 'Right Wheel')));
    await page.getByTestId('mode-control').click();
    await page.getByTestId('setup-drive-problems').waitFor();
    assert((await page.getByTestId('setup-drive-guide').getAttribute('data-repairable')) === 'false', 'one-wheel robot must not be repairable');
    await page.getByTestId('setup-drive').click();
    await page.getByTestId('setup-drive-error').waitFor();
    assert(/1 drive wheel/.test(await text('setup-drive-error')), 'error does not name the missing wheel');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('arai.projects.v1')).state.projects.prj_onewheel);
    assert(stored.joints.length === 0 && stored.controllers.length === 0, 'unsafe robot was changed');
    await shot('06-unsafe-robot-guided-message');
  });

  await step('A8: a fresh Explorer Bot is unchanged: it has its drive and W/A/S/D move it', async () => {
    await createProject(page, BASE, 'explorer', 'Fresh Explorer');
    await page.getByTestId('mode-control').click();
    assert((await page.getByTestId('setup-drive-guide').count()) === 0, 'fresh Explorer Bot lost its drive');
    assert((await page.getByTestId('command-error').count()) === 0, 'fresh Explorer Bot shows an error');
    assert((await page.getByTestId('drive-wheels-left').getAttribute('data-part')) === 'Left Wheel', 'fresh left wheel label');
    assert((await page.getByTestId('drive-wheels-warnings').count()) === 0, 'fresh Explorer Bot shows a naming warning');
    await wasd('fresh');
    await shot('07-fresh-explorer-bot');
  });

  await step('No browser console errors', async () => {
    assert(suite.consoleErrors.length === 0, `console errors: ${suite.consoleErrors.slice(0, 3).join(' | ')}`);
  });

  await browser.close();
  ok = suite.summary();
} catch (error) {
  console.error(error);
} finally {
  server.stop();
}
process.exit(ok ? 0 : 1);
