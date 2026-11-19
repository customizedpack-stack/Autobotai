/**
 * Phase 7 Environment Editor in a real browser — the brief's manual workflows A–F:
 * A creation, B editing, C physics in Test Mode, D sensors, E Code Studio, F persistence.
 * Screenshots of the running app are saved to docs/testing/phase-7/.
 */
import { assert, canvasStats, createProject, createSuite, launch, startServer } from './helpers.mjs';

const SHOTS = 'docs/testing/phase-7';
const suite = createSuite('environment');
const step = (name, fn) => suite.step(name, fn);
const server = await startServer(4189);
const BASE = server.url;
let ok = false;

try {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    window.__ARAI_E2E__ = true;
  });
  const page = await context.newPage();
  suite.watch(page);
  page.on('requestfailed', (r) => {
    const sandboxTeardown = r.url().startsWith('blob:null/') && r.failure()?.errorText === 'net::ERR_ABORTED';
    if (!sandboxTeardown) suite.consoleErrors.push(`request failed: ${r.url()} (${r.failure()?.errorText ?? ''})`);
  });
  console.log('\nPhase 7 Environment Editor\n');

  const text = (id) => page.getByTestId(id).textContent();
  const value = (id) => page.getByTestId(id).inputValue();
  const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
  const focusWorkspace = () => page.getByTestId('status-bar').click();
  const hold = async (key, ms) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
  };
  const setField = async (id, v) => {
    await page.getByTestId(id).fill(String(v));
    await page.getByTestId(id).press('Enter');
    await page.waitForTimeout(80);
  };
  const objectsTab = () => page.getByRole('tab', { name: /^Objects/ }).click();
  const libraryTab = () => page.getByRole('tab', { name: 'Library' }).click();
  const selectObject = async (name) => {
    await objectsTab();
    await page.getByTestId(`env-object-${name}`).getByRole('button', { name, exact: true }).click();
    await page.getByTestId('environment-object-inspector').waitFor();
  };
  const objectCount = async () => page.getByTestId('environment-objects').locator('li').count();
  const screen = (name) =>
    page.evaluate((n) => {
      const id = window.__araiIdByName?.(n);
      return id ? window.__araiScreenPosition?.(id) ?? null : null;
    }, name);
  /** Add an object from the library and set its name, position, size and rotation in the inspector. */
  const add = async (item, name, { pos, size, rot } = {}) => {
    await libraryTab();
    await page.getByTestId(`env-add-${item}`).click();
    await page.getByTestId('environment-object-inspector').waitFor();
    await page.getByTestId('env-insp-name').fill(name);
    await page.getByTestId('env-insp-name').press('Enter');
    if (pos) for (const [i, a] of ['x', 'y', 'z'].entries()) await setField(`env-insp-pos-${a}`, pos[i]);
    if (size) for (const [i] of size.entries()) await setField(`env-insp-size-${i}`, size[i]);
    if (rot) for (const [i, a] of ['x', 'y', 'z'].entries()) await setField(`env-insp-rot-${a}`, rot[i]);
  };
  const monitor = (id, label) => text(`monitor-${id}-${label}`);
  const openMonitor = async () => {
    await page.getByRole('tab', { name: /^Sensors/ }).click();
    await page.getByTestId('sensor-monitor').waitFor();
  };
  const waitSim = (state) => page.locator(`[data-testid="simulation-panel"][data-state="${state}"]`).waitFor({ timeout: 20000 });
  const position = async () => (await text('telemetry-position')).split(',').map(Number);

  // ── Test A — Environment creation ──
  await step('A1–3: dashboard → open robot project → Environment Editor (empty state)', async () => {
    await createProject(page, BASE, 'explorer-bot', 'Env Test Bot');
    await page.goto(BASE);
    await page.getByRole('link', { name: 'Open Env Test Bot' }).click();
    await page.getByTestId('workspace').waitFor();
    await page.getByTestId('mode-environment').click();
    await page.getByTestId('environment-toolbar').waitFor();
    await page.getByTestId('environment-manager').waitFor();
    await page.getByTestId('environment-banner').waitFor();
    assert((await text('env-name')) === 'No environment open', 'an environment was open unexpectedly');
    assert((await text('status-mode')) === 'Environment Editor', 'status bar mode');
    await shot('01-environment-editor-empty-state');
  });

  await step('A4: create a new empty environment; the object library lists every object kind', async () => {
    await page.getByTestId('env-new-empty').click();
    await libraryTab();
    for (const id of ['ground', 'wall', 'box', 'platform', 'ramp', 'obstacle-box', 'obstacle-cylinder', 'obstacle-sphere']) await page.getByTestId(`env-add-${id}`).waitFor();
    assert((await text('env-name')) === 'New Environment', `name ${await text('env-name')}`);
    await shot('02-object-library');
  });

  await step('A5–6: add a ground plane and four walls', async () => {
    await add('ground', 'Floor', { size: [6, 0.1, 6] });
    await add('wall', 'North Wall', { pos: [2, 0.2, 0], size: [0.1, 0.4, 4] });
    await add('wall', 'South Wall', { pos: [-2, 0.2, 0], size: [0.1, 0.4, 4] });
    await add('wall', 'East Wall', { pos: [0, 0.2, 2], size: [4, 0.4, 0.1] });
    await add('wall', 'West Wall', { pos: [0, 0.2, -2], size: [4, 0.4, 0.1] });
    await objectsTab();
    assert((await objectCount()) === 5, `objects ${await objectCount()}`);
    await page.getByRole('button', { name: 'Top', exact: true }).click();
    await page.waitForTimeout(900);
    await shot('03-ground-and-walls');
  });

  await step('A7–9: add two boxes and a ramp; every object appears in the viewport', async () => {
    await add('box', 'Box', { pos: [0.6, 0.1, 1.1], size: [0.2, 0.2, 0.2] });
    await add('box', 'Box 2', { pos: [0.6, 0.1, -1.1] });
    await add('ramp', 'Ramp', { pos: [1.0, 0.04, 0], size: [0.6, 0.08, 0.8] });
    await objectsTab();
    assert((await objectCount()) === 8, `objects ${await objectCount()}`);
    await page.getByRole('button', { name: 'Perspective', exact: true }).click();
    await page.waitForTimeout(900);
    const canvas = await page.locator('canvas').first().boundingBox();
    for (const name of ['Floor', 'North Wall', 'South Wall', 'East Wall', 'West Wall', 'Box', 'Box 2', 'Ramp']) {
      const p = await screen(name);
      assert(p && p.x > canvas.x && p.x < canvas.x + canvas.width && p.y > canvas.y && p.y < canvas.y + canvas.height, `${name} is not in the viewport (${JSON.stringify(p)})`);
    }
    await shot('04-boxes-and-ramp');
  });

  // ── Test B — Editing ──
  await step('B1, B2: select a box; the move gizmo moves it and the inspector follows (visual → inspector)', async () => {
    await selectObject('Box');
    await shot('05-selected-object-inspector');
    await page.getByRole('button', { name: 'Top', exact: true }).click();
    await page.waitForTimeout(900);
    await focusWorkspace();
    await page.keyboard.press('w');
    await page.waitForTimeout(300);
    const before = Number(await value('env-insp-pos-x'));
    const p = await screen('Box');
    assert(p, 'no screen position for Box');
    await shot('06-transform-gizmo');
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 40, p.y, { steps: 6 });
    await page.mouse.move(p.x + 80, p.y, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const after = await Promise.all(['x', 'z'].map((a) => value(`env-insp-pos-${a}`)));
    assert(Number(after[0]) !== before || Number(after[1]) !== 1.1, `gizmo did not move the box (${after.join(', ')})`);
  });

  await step('B3: the rotate gizmo rotates the box', async () => {
    await focusWorkspace();
    await page.keyboard.press('e');
    await page.waitForTimeout(250);
    const p = await screen('Box');
    await page.mouse.move(p.x + 8, p.y + 8);
    await page.mouse.down();
    await page.mouse.move(p.x + 50, p.y + 30, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const rot = await Promise.all(['x', 'y', 'z'].map((a) => value(`env-insp-rot-${a}`)));
    assert(rot.some((r) => Number(r) !== 0), `rotation unchanged (${rot.join(', ')})`);
    await focusWorkspace();
    await page.keyboard.press('w');
  });

  await step('B4–6: inspector dimensions and friction change the object (inspector → visual)', async () => {
    const before = await screen('Box');
    await setField('env-insp-pos-x', 0.4);
    await page.waitForTimeout(250);
    const after = await screen('Box');
    assert(Math.abs(after.x - before.x) + Math.abs(after.y - before.y) > 5, 'the viewport did not follow the inspector position');
    const s0 = await canvasStats(page);
    await setField('env-insp-size-0', 0.35);
    await page.waitForTimeout(300);
    assert((await value('env-insp-size-0')) === '0.35', 'width not applied');
    assert((await canvasStats(page)).signature !== s0.signature, 'the viewport did not redraw the resized box');
    await setField('env-insp-friction', 0.3);
    assert((await value('env-insp-friction')) === '0.3', 'friction not applied');
    await setField('env-insp-friction', 5);
    await page.getByTestId('env-insp-error').getByText(/Friction must be between 0 and 2/).waitFor();
    await page.getByTestId('env-insp-friction').scrollIntoViewIfNeeded();
    await shot('07-physics-properties-panel');
  });

  await step('B7–10: duplicate the box, delete the duplicate, undo and redo', async () => {
    await page.getByTestId('env-insp-duplicate').click();
    await objectsTab();
    assert((await objectCount()) === 9, 'duplicate not added');
    await page.getByTestId('env-insp-delete').click();
    assert((await objectCount()) === 8, 'duplicate not deleted');
    await page.getByTestId('undo').click();
    assert((await objectCount()) === 9, 'undo did not restore the duplicate');
    await page.getByTestId('redo').click();
    assert((await objectCount()) === 8, 'redo did not delete it again');
    await selectObject('Box');
    assert((await value('env-insp-friction')) === '0.3', 'friction lost');
  });

  // ── Test C — Physics ──
  await step('C1–4: save, Test Environment: Physics starts and the custom ground supports the robot', async () => {
    await page.getByTestId('env-save').click();
    await page.getByTestId('env-test').click();
    await waitSim('running');
    assert((await text('status-mode')) === 'Control Mode', 'Test Mode is not Control Mode');
    assert((await page.getByTestId('sim-environment').inputValue()).startsWith('envd_'), 'the custom environment is not selected');
    await openMonitor();
    await page.waitForTimeout(1200);
    const [x, z] = await position();
    assert(Math.abs(x) < 0.02 && Math.abs(z) < 0.02, `robot moved while resting (${x}, ${z})`);
    const imu = await monitor('main-imu', 'specific-force-y');
    assert(Number.parseFloat(imu) > 9.5, `the robot is not supported by the custom ground (specific force ${imu})`);
    await page.getByRole('tab', { name: /^Environment/ }).click();
    await page.getByTestId('env-status-built').waitFor();
    assert((await page.getByTestId('env-status-built').locator('tbody tr').count()) === 8, 'not every object was built');
    await page.getByRole('button', { name: 'Perspective', exact: true }).click();
    await page.waitForTimeout(600);
    await shot('08-test-mode-with-robot');
  });

  await step('C5–8: drive over the ramp (the IMU shows the incline) into the wall (collision stops it)', async () => {
    await openMonitor();
    await page.getByTestId('speed-100').click();
    await focusWorkspace();
    let maxPitch = 0;
    await page.keyboard.down('w');
    for (let i = 0; i < 24; i++) {
      await page.waitForTimeout(250);
      const ypr = await monitor('main-imu', 'yaw-pitch-roll');
      maxPitch = Math.max(maxPitch, Number.parseFloat(ypr.split('/')[1]));
    }
    await page.keyboard.up('w');
    await page.waitForTimeout(400);
    const [x] = await position();
    assert(maxPitch > 3, `no incline seen by the IMU (max pitch ${maxPitch}°)`);
    assert(x > 1.2 && x < 1.9, `the wall at x = 1.95 did not stop the robot (x ${x})`);
    await shot('09-robot-colliding-with-wall');
  });

  await step('C9–10: Stop; the robot stops; Edit returns to editing with the saved environment', async () => {
    await page.getByTestId('sim-stop').click();
    await waitSim('stopped');
    assert((await text('movement-status')) !== 'moving', 'robot still moving');
    await page.getByTestId('sim-edit-environment').click();
    await page.getByTestId('environment-toolbar').waitFor();
    await objectsTab();
    assert((await objectCount()) === 8, 'environment changed after the test');
    assert((await text('env-name')) === 'New Environment', 'another environment opened');
  });

  // ── Test D — Sensors ──
  await step('D1–2: the front distance sensor detects the custom wall', async () => {
    await page.getByTestId('env-test').click();
    await waitSim('running');
    await openMonitor();
    await page.waitForTimeout(800);
    const d = Number.parseFloat(await monitor('front-distance', 'distance'));
    // North Wall face at x = 1.95; the sensor sits about 0.215 m ahead of the chassis center.
    assert(d > 1.65 && d < 1.8, `distance to the custom wall: ${d}`);
    await shot('10-distance-sensor-detects-custom-wall');
    await shot('11-sensor-monitor-live-readings');
  });

  let movedDistance = 0;
  await step('D3–4: move the wall in the editor; the distance changes', async () => {
    await page.getByTestId('sim-edit-environment').click();
    await selectObject('North Wall');
    await setField('env-insp-pos-x', 1.5);
    await page.getByTestId('env-test').click();
    await waitSim('running');
    await openMonitor();
    await page.waitForTimeout(800);
    movedDistance = Number.parseFloat(await monitor('front-distance', 'distance'));
    assert(movedDistance > 1.15 && movedDistance < 1.3, `distance after moving the wall: ${movedDistance}`);
  });

  await step('D5–6: rotate the wall; the reading and the ray drawing update', async () => {
    const before = await canvasStats(page);
    await page.getByTestId('sim-edit-environment').click();
    await selectObject('North Wall');
    await setField('env-insp-rot-y', 45);
    await page.getByTestId('env-test').click();
    await waitSim('running');
    await openMonitor();
    await page.waitForTimeout(800);
    const d = Number.parseFloat(await monitor('front-distance', 'distance'));
    // The 0.1 m thick wall turned 45°: its face crosses the ray 0.05·√2 − 0.05 ≈ 0.021 m closer.
    assert(Math.abs(movedDistance - d - 0.021) < 0.006, `rotated wall distance ${d} vs ${movedDistance}`);
    assert((await canvasStats(page)).signature !== before.signature, 'ray view did not change');
  });

  await step('D7–10: driving changes the encoders; turning changes the IMU', async () => {
    await page.getByTestId('panel-reset-encoders').click();
    await focusWorkspace();
    await hold('w', 800);
    await page.waitForTimeout(300);
    const revs = Number(await monitor('left-encoder', 'revolutions'));
    assert(revs > 0.3, `encoder did not count (${revs})`);
    await page.keyboard.down('a');
    await page.waitForTimeout(700);
    const w = await monitor('main-imu', 'angular-velocity');
    await page.keyboard.up('a');
    assert(/\(y (0\.[3-9]|[1-9])/.test(w), `IMU yaw rate while turning: ${w}`);
  });

  // ── Test E — Code Studio ──
  await step('E1–7: JavaScript reads the front distance sensor in the custom environment; Stop cleans up', async () => {
    await page.getByTestId('sim-reset').click();
    await page.waitForTimeout(600);
    const expected = Number.parseFloat(await monitor('front-distance', 'distance'));
    await page.getByTestId('mode-code').click();
    await page.getByTestId('code-studio').waitFor();
    await page.getByTestId('lang-javascript').click();
    await page.getByTestId('js-editor').waitFor();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.insertText(`const d = await robotSensors.distance("front-distance").read();
console.log("custom env distance", d.status, d.distance.toFixed(3));
await robotSensors.imu("main-imu").subscribe(() => {});
await wait(20000);
`);
    await page.getByTestId('run-program').click();
    await page.getByTestId('program-log').getByText(/custom env distance hit/).waitFor({ timeout: 20000 });
    const log = await page.getByTestId('program-log').innerText();
    const measured = Number(log.match(/custom env distance hit ([\d.]+)/)[1]);
    assert(Math.abs(measured - expected) < 0.03, `program reading ${measured} vs monitor ${expected}`);
    assert((await page.evaluate(() => window.__araiSensorListeners())) >= 1, 'subscription not active');
    await page.screenshot({ path: `${SHOTS}/12-javascript-sensor-reading.png` });
    await page.getByTestId('stop-program').click();
    await page.getByTestId('execution-status').filter({ hasText: /Stopped|Idle/ }).waitFor();
    assert((await page.evaluate(() => window.__araiSensorListeners())) === 0, 'sensor subscription leaked after Stop');
  });

  await step('E8–12: a Blockly obstacle-detection program stops the robot before the custom wall', async () => {
    await page.getByTestId('lang-blockly').click();
    await page.getByTestId('blockly-editor').waitFor({ timeout: 20000 });
    await page.evaluate(() => {
      const { workspace, Blockly } = window.__araiBlockly;
      const num = (v) => ({ shadow: { type: 'math_number', fields: { NUM: v } } });
      workspace.clear();
      Blockly.serialization.workspaces.load(
        {
          blocks: {
            languageVersion: 0,
            blocks: [
              {
                type: 'robot_start',
                x: 40,
                y: 40,
                next: {
                  block: {
                    type: 'robot_drive_at_speed',
                    inputs: { SPEED: num(0.6) },
                    next: {
                      block: {
                        type: 'sensor_wait_until_distance',
                        fields: { SENSOR: 'front-distance', OP: '<' },
                        inputs: { METERS: num(0.35) },
                        next: { block: { type: 'robot_stop', next: { block: { type: 'robot_log_value', fields: { LABEL: 'stopped at' }, inputs: { VALUE: { block: { type: 'sensor_distance_m', fields: { SENSOR: 'front-distance' } } } } } } } },
                      },
                    },
                  },
                },
              },
            ],
          },
        },
        workspace,
      );
    });
    await page.getByTestId('reset-robot').click();
    await page.waitForTimeout(400);
    await page.getByTestId('run-program').click();
    await page.getByTestId('execution-status').filter({ hasText: 'Completed' }).waitFor({ timeout: 30000 });
    const log = await page.getByTestId('program-log').innerText();
    const match = log.match(/stopped at = ([\d.]+)/);
    assert(match && Number(match[1]) < 0.35 && Number(match[1]) > 0.05, `stop distance ${match?.[1]}`);
    assert((await page.evaluate(() => window.__araiSensorListeners())) === 0, 'Blockly left a subscription behind');
    await page.screenshot({ path: `${SHOTS}/13-blockly-obstacle-detection.png` });
  });

  // ── Test F — Persistence ──
  await step('F1–8: save, reload the browser, reopen the project: objects, transforms, physics and sensors remain', async () => {
    await page.getByTestId('mode-environment').click();
    await page.getByTestId('env-save').click();
    await page.getByTestId('mode-build').click();
    await page.getByTestId('save').click();
    await page.reload();
    await page.getByTestId('workspace').waitFor();
    await page.goto(BASE);
    await page.getByRole('link', { name: 'Open Env Test Bot' }).click();
    await page.getByTestId('workspace').waitFor();
    await page.waitForTimeout(800);
    await page.getByTestId('sensors-section').waitFor();
    for (const id of ['front-distance', 'left-encoder', 'right-encoder', 'main-imu']) await page.getByTestId(`sensor-row-${id}`).waitFor();
    await page.getByTestId('mode-environment').click();
    await page.getByTestId('environment-toolbar').waitFor();
    assert((await text('env-name')) === 'New Environment', `the project did not reopen its environment (${await text('env-name')})`);
    await objectsTab();
    assert((await objectCount()) === 8, `objects after reload: ${await objectCount()}`);
    await selectObject('North Wall');
    assert((await value('env-insp-pos-x')) === '1.5', 'wall position lost');
    assert((await value('env-insp-rot-y')) === '45', 'wall rotation lost');
    await selectObject('Box');
    assert((await value('env-insp-friction')) === '0.3', 'friction lost');
    assert((await value('env-insp-size-0')) === '0.35', 'size lost');
    await page.getByRole('button', { name: 'Perspective', exact: true }).click();
    await page.waitForTimeout(700);
    await shot('14-saved-and-reloaded-environment');
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
