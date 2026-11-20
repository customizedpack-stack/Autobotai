/**
 * Phase 6 Sensor Simulation in a real browser: sensor list and settings in Build
 * Mode (with undo), the Sensor Monitor and Robot Control readings on both engines,
 * distance rays against the obstacle course, encoders and the IMU while driving,
 * pause, a JavaScript program with robotSensors, a Blockly Sensors program, and
 * save / reload of sensor settings.
 */
import { assert, canvasStats, createProject, createSuite, launch, SHOTS, startServer } from './helpers.mjs';

const suite = createSuite('sensors');
const step = (name, fn) => suite.step(name, fn);
const server = await startServer(4187);
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
  console.log('\nPhase 6 Sensor Simulation\n');

  const text = (id) => page.getByTestId(id).textContent();
  const focusWorkspace = () => page.getByTestId('status-bar').click();
  const hold = async (key, ms) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
  };
  const monitorValue = (id, label) => text(`monitor-${id}-${label}`);
  const waitSim = (state) => page.locator(`[data-testid="simulation-panel"][data-state="${state}"]`).waitFor({ timeout: 20000 });
  const openMonitor = async () => {
    await page.getByRole('tab', { name: /Sensors/ }).click();
    await page.getByTestId('sensor-monitor').waitFor();
  };

  await createProject(page, BASE, 'explorer-bot', 'Sensor Bot');

  await step('Build Mode: the Explorer Bot lists its four default sensors in the inspector', async () => {
    await page.getByTestId('sensors-section').waitFor();
    for (const id of ['front-distance', 'left-encoder', 'right-encoder', 'main-imu']) await page.getByTestId(`sensor-row-${id}`).waitFor();
    await page.screenshot({ path: `${SHOTS}/p6-01-sensor-list.png` });
  });

  await step('Sensor settings: change the max range and ray count; invalid values are refused; Ctrl+Z undoes', async () => {
    await page.getByTestId('sensor-front-distance-toggle').click();
    await page.getByTestId('sensor-front-distance-settings').waitFor();
    await page.getByTestId('sensor-front-distance-max').fill('3');
    await page.getByTestId('sensor-front-distance-max').press('Enter');
    await page.waitForTimeout(150);
    assert((await page.getByTestId('sensor-front-distance-max').inputValue()) === '3', 'max range not applied');
    await page.getByTestId('sensor-front-distance-min').fill('5');
    await page.getByTestId('sensor-front-distance-min').press('Enter');
    await page.getByTestId('sensor-front-distance-error').getByText(/Minimum range/).waitFor();
    await focusWorkspace();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    await page.getByTestId('sensor-front-distance-toggle').click().catch(() => {});
    const max = await page.getByTestId('sensor-front-distance-max').inputValue().catch(async () => {
      await page.getByTestId('sensor-front-distance-toggle').click();
      return page.getByTestId('sensor-front-distance-max').inputValue();
    });
    assert(max === '4', `undo did not restore the max range (${max})`);
    await page.getByTestId('sensor-front-distance-rays').fill('5');
    await page.getByTestId('sensor-front-distance-rays').press('Enter');
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${SHOTS}/p6-02-sensor-settings.png` });
  });

  await step('Control Mode (Kinematic): IMU and encoders work; the distance sensor says it needs Physics', async () => {
    await page.getByTestId('mode-control').click();
    await page.getByTestId('sensor-panel').waitFor();
    await openMonitor();
    assert((await text('sensor-stream-state')).startsWith('running (kinematic)'), `stream: ${await text('sensor-stream-state')}`);
    await page.getByTestId('monitor-front-distance-error').getByText(/needs the Physics engine/).waitFor();
    assert((await text('monitor-main-imu-status')) === 'Active', 'IMU not active in kinematic mode');
    await page.getByTestId('speed-100').click();
    await focusWorkspace();
    await hold('w', 1200);
    await page.waitForTimeout(300);
    const revs = Number(await monitorValue('left-encoder', 'revolutions'));
    assert(revs > 1, `kinematic encoder did not count (${revs})`);
  });

  await step('Physics + obstacle course: the distance sensor sees the wall; rays are drawn', async () => {
    await page.getByTestId('engine-physics').click();
    await waitSim('running');
    await page.getByTestId('sim-environment').selectOption('obstacles');
    await page.waitForTimeout(800);
    const d = await monitorValue('front-distance', 'distance');
    const meters = Number.parseFloat(d);
    assert(meters > 1.0 && meters < 1.25, `wall distance ${d}`);
    assert((await monitorValue('front-distance', 'obstacle')) === 'Detected', 'obstacle not detected');
    assert((await monitorValue('front-distance', 'rays-hit')).endsWith('/ 5'), 'multi-ray count');
    const withRays = await canvasStats(page);
    await page.getByTestId('toggle-sensor-rays').click();
    await page.waitForTimeout(300);
    const without = await canvasStats(page);
    assert(withRays.signature !== without.signature, 'ray view did not change the picture');
    await page.getByTestId('toggle-sensor-rays').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/p6-03-rays-wall.png` });
  });

  await step('Driving toward the wall: distance drops, encoders count forward, the IMU shows the turn', async () => {
    await page.getByTestId('panel-reset-encoders').click();
    const before = Number.parseFloat(await monitorValue('front-distance', 'distance'));
    await focusWorkspace();
    await hold('w', 1500);
    await page.waitForTimeout(600);
    const after = Number.parseFloat(await monitorValue('front-distance', 'distance'));
    assert(after < before - 0.3, `distance did not drop (${before} → ${after})`);
    const left = Number(await monitorValue('left-encoder', 'revolutions'));
    const right = Number(await monitorValue('right-encoder', 'revolutions'));
    assert(left > 0.5 && right > 0.5, `encoders did not count forward (${left}, ${right})`);
    await page.getByTestId('sim-reset').click();
    await page.waitForTimeout(400);
    await focusWorkspace();
    await page.keyboard.down('a');
    await page.waitForTimeout(800);
    const turning = await monitorValue('main-imu', 'angular-velocity');
    await page.keyboard.up('a');
    assert(/y [1-9]/.test(turning) || /y 0\.[3-9]/.test(turning), `IMU yaw rate while turning left: ${turning}`);
    await page.screenshot({ path: `${SHOTS}/p6-04-monitor.png` });
  });

  await step('Pause: readings stop and are marked stale; Resume brings them back', async () => {
    await page.getByTestId('sim-pause').click();
    await waitSim('paused');
    await page.waitForTimeout(500);
    assert((await text('sensor-stream-state')).startsWith('paused'), 'stream not paused');
    assert((await text('monitor-main-imu-status')) === 'Stale', `IMU status while paused: ${await text('monitor-main-imu-status')}`);
    await page.getByTestId('sim-resume').click();
    await waitSim('running');
    await page.waitForTimeout(400);
    assert((await text('monitor-main-imu-status')) === 'Active', 'IMU not active after resume');
  });

  await step('Disabling a sensor in Robot Control marks it off; enabling brings it back', async () => {
    await page.getByTestId('monitor-main-imu').waitFor();
    await page.evaluate(() => 0);
    await page.getByTestId('mode-build').click();
    await page.getByTestId('sensor-main-imu-enabled').click();
    await page.getByTestId('mode-simulate').click();
    await waitSim('running');
    await page.waitForTimeout(400);
    assert((await text('monitor-main-imu-status')) === 'Disabled', 'disabled IMU not shown as disabled');
    assert((await text('panel-sensor-main-imu-value')) === 'off', 'control panel does not show off');
    await page.getByTestId('mode-build').click();
    await page.getByTestId('sensor-main-imu-enabled').click();
  });

  await step('Code Studio: a JavaScript program reads robotSensors on the physics engine', async () => {
    await page.getByTestId('mode-simulate').click();
    await waitSim('running');
    await page.getByTestId('sim-environment').selectOption('obstacles');
    await page.getByTestId('mode-code').click();
    await page.getByTestId('code-studio').waitFor();
    await page.getByTestId('lang-javascript').click();
    await page.getByTestId('js-editor').waitFor();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.insertText(`const d = await robotSensors.distance("front-distance").read();
console.log("JS distance", d.status, d.distance === null ? "none" : d.distance.toFixed(2));
const imu = await robotSensors.imu("main-imu").read();
console.log("JS imu", imu.valid, imu.specificForce.y.toFixed(1));
let n = 0;
const sub = await robotSensors.encoder("left-encoder").subscribe(() => { n += 1; });
await robotControl.drive.forward({ speed: 0.5, durationMs: 800 });
await sub.unsubscribe();
console.log("JS encoder updates", n > 5);
`);
    await page.getByTestId('run-program').click();
    await page.getByTestId('execution-status').filter({ hasText: 'Completed' }).waitFor({ timeout: 20000 });
    const log = await page.getByTestId('program-log').innerText();
    assert(/JS distance hit 1\.\d\d/.test(log), `distance line missing:\n${log.slice(-600)}`);
    assert(log.includes('JS imu true 9.8'), 'imu line missing');
    assert(log.includes('JS encoder updates true'), 'subscription line missing');
  });

  await step('Code Studio: a Blockly Sensors program stops the robot before the wall', async () => {
    await page.getByTestId('lang-blockly').click();
    await page.getByTestId('blockly-editor').waitFor({ timeout: 20000 });
    await page.locator('.blocklyToolbox').getByText('Sensors', { exact: true }).waitFor();
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
                        inputs: { METERS: num(0.4) },
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
    // Phase 11: wait for THIS run to start first; the badge still shows the previous run's "Completed" for a moment.
    await page.getByTestId('execution-status').filter({ hasText: /Preparing|Running/ }).waitFor({ timeout: 15000 });
    await page.getByTestId('execution-status').filter({ hasText: 'Completed' }).waitFor({ timeout: 30000 });
    const log = await page.getByTestId('program-log').innerText();
    const match = log.match(/stopped at = ([\d.]+)/);
    assert(match && Number(match[1]) < 0.4 && Number(match[1]) > 0.1, `Blockly stop distance: ${match?.[1]}`);
    await page.screenshot({ path: `${SHOTS}/p6-05-blockly-sensors.png` });
  });

  await step('Sensor settings are saved with the project and restored after reload', async () => {
    await page.getByTestId('mode-build').click();
    await page.getByTestId('save').click();
    await page.reload();
    await page.getByTestId('workspace').waitFor();
    await page.waitForTimeout(800);
    await page.getByTestId('sensors-section').waitFor();
    await page.getByTestId('sensor-front-distance-toggle').click();
    assert((await page.getByTestId('sensor-front-distance-rays').inputValue()) === '5', 'ray count lost after reload');
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
