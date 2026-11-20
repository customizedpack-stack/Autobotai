/**
 * Phase 10 hardware integration in a real browser — workflows A–P from the brief.
 *
 * ALL hardware steps here use the SIMULATED DEVICE (the firmware logic running in the
 * page). NO physical hardware is involved and none of these results are physical
 * hardware tests. Screenshot names start with "simulated-device-".
 * Screenshots: docs/testing/phase-10/.
 */
import { mkdirSync } from 'node:fs';
import { assert, createProject, createSuite, launch, startServer } from './helpers.mjs';

const SHOTS = 'docs/testing/phase-10';
mkdirSync(SHOTS, { recursive: true });
const suite = createSuite('hardware');
const step = (name, fn) => suite.step(name, fn);
const server = await startServer(4201);
const BASE = server.url;
let ok = false;

try {
  const browser = await launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  suite.watch(page);
  console.log('\nPhase 10 Hardware (SIMULATED DEVICE — not physical hardware)\n');

  const shot = (name) => page.screenshot({ path: `${SHOTS}/simulated-device-${name}.png` });
  const text = (id) => page.getByTestId(id).textContent();
  const tab = async (id) => {
    await page.getByTestId(`bp-tab-${id}`).click();
    await page.getByTestId(`bp-panel-${id}`).waitFor();
  };
  const row = (name) => page.locator(`[data-name="${name}"]`);
  const pick = async (name, partId, search) => {
    await row(name).locator('[data-testid^="map-"]').click();
    await page.getByTestId('part-picker').waitFor();
    await page.getByTestId('part-category').selectOption('all');
    if (search) await page.getByTestId('part-search').fill(search);
    await page.getByTestId(`pick-${partId}`).click();
    await row(name).locator('[data-testid^="vc-part-"]').waitFor();
  };
  const sim = (expr) => page.evaluate((e) => new Function('d', `return ${e}`)(window.__araiSimulatedDevice), expr);
  const hwState = () => page.getByTestId('hw-state').getAttribute('data-state');
  const waitState = (state, timeout = 8000) => page.waitForFunction((s) => document.querySelector('[data-testid="hw-state"]')?.getAttribute('data-state') === s, state, { timeout });
  const validate = async () => {
    await page.getByTestId('hw-validate').click();
    await page.getByTestId('hw-validation-summary').waitFor();
  };
  const goHardware = async () => {
    await page.getByTestId('mode-blueprint').click();
    await page.getByTestId('blueprint-pane').waitFor({ timeout: 15000 });
    await tab('hardware');
  };
  const arm = async () => {
    const box = page.getByTestId('hw-confirm-safe');
    if (!(await box.isChecked())) await box.check();
    await page.getByTestId('hw-arm').click();
    await page.waitForFunction(() => window.__araiSimulatedDevice?.state === 'armed', null, { timeout: 5000 });
  };

  await step('Setup: Explorer Bot with a saved JavaScript program', async () => {
    await createProject(page, BASE, 'explorer-bot', 'Hardware Bot');
    await page.getByTestId('mode-code').click();
    await page.getByTestId('code-studio').waitFor();
    await page.getByTestId('lang-javascript').click();
    await page.getByTestId('js-editor').waitFor();
    await page.getByTestId('program-name').fill('Physical Drive');
    await page.getByTestId('program-name').press('Enter');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.insertText('const d = await robotSensors.distance("front-distance").read();\nprint("distance source", d.source, d.valid);\nawait robotControl.drive.forward({ speed: 1, durationMs: 1500 });\n');
    await page.getByTestId('save-program').click();
    await page.getByTestId('mode-build').click();
    await page.getByTestId('save').click();
  });

  await step('A. Open Explorer Bot', async () => {
    await page.goto(BASE);
    await page.getByRole('link', { name: 'Open Hardware Bot' }).click();
    await page.getByTestId('workspace').waitFor();
  });

  await step('B. Open the Blueprint', async () => {
    await page.getByTestId('mode-blueprint').click();
    await page.getByTestId('blueprint-pane').waitFor({ timeout: 15000 });
    assert(await page.getByTestId('bp-tab-hardware').isVisible(), 'Hardware tab missing');
  });

  await step('D. Open the Hardware workspace (empty state, no device)', async () => {
    await tab('hardware');
    await page.getByTestId('hw-select-profile').waitFor();
    assert((await hwState()) === 'not-connected', `state ${await hwState()}`);
    assert((await page.getByTestId('estop').count()) === 0, 'E-stop shown without a device');
    await shot('01-hardware-workspace-empty');
  });

  await step('C. Validate the hardware mapping (reference parts, wiring pin map, power, motor-power switch)', async () => {
    await tab('parts');
    await pick('Left Motor', 'pololu-1101', 'gearmotor hp');
    await pick('Right Motor', 'pololu-1101', 'gearmotor hp');
    await pick('Left Wheel', 'pololu-1429', 'wheel');
    await pick('Right Wheel', 'pololu-1429', 'wheel');
    await pick('Controller Board', 'espressif-esp32-devkitc-v4', 'esp32');
    await pick('Distance Sensor', 'pololu-2490', 'vl53l0x');
    await page.getByTestId('hardware-role').selectOption('driver');
    await page.getByTestId('add-hardware').click();
    await page.getByTestId('pick-pololu-713').click();
    await row('Motor driver').locator('[data-testid^="vc-part-"]').waitFor();
    await tab('wiring');
    await page.getByTestId('wiring-standard').click();
    await tab('hardware');
    await page.getByTestId('hw-select-profile').click();
    await validate();
    for (const id of ['power:supply', 'safety:switch', 'wiring:pins']) assert((await page.getByTestId(`hw-item-${id}`).getAttribute('data-level')) === 'blocker', `${id} not blocking`);
    assert((await page.getByTestId('hw-validation-summary').getAttribute('data-ready')) === 'false', 'ready too early');
    await shot('02-validation-blockers');
    await page.getByTestId('hw-fix-pins').click();
    await page.getByTestId('hw-add-switch').click();
    await page.getByTestId('hw-switch-confirm').check();
    await page.getByTestId('hw-power-kind').selectOption('battery');
    await page.getByTestId('hw-power-voltage').fill('4.8');
    await page.getByTestId('hw-power-voltage').blur();
    await page.getByTestId('hw-power-current').fill('4');
    await page.getByTestId('hw-power-current').blur();
    await page.getByTestId('hw-power-source').fill('E2E test value (simulated)');
    await page.getByTestId('hw-power-save').click();
    await validate();
    const acks = page.locator('[data-testid^="hw-ack-"]');
    const n = await acks.count();
    assert(n >= 2, `expected accepted-warning checkboxes, got ${n}`);
    for (let i = 0; i < n; i++) await acks.nth(i).check();
    await page.waitForFunction(() => document.querySelector('[data-testid="hw-validation-summary"]')?.getAttribute('data-ready') === 'true', null, { timeout: 5000 });
    await shot('03-validation-ready');
  });

  await step('E. Connect to the simulated device (clearly labeled)', async () => {
    await page.getByTestId('hw-method').selectOption('simulated');
    await page.getByTestId('hw-connect').click();
    await waitState('connected');
    await page.getByTestId('hw-sim-banner').waitFor();
    assert(await page.getByTestId('estop').isVisible(), 'E-stop not shown');
    assert(await page.getByTestId('hw-sim-badge').isVisible(), 'simulated-device badge not shown in the top bar');
  });

  await step('F. Verify the handshake (device, firmware, protocol) and motors disabled', async () => {
    assert((await text('hw-device')) === 'explorer-bot-esp32', await text('hw-device'));
    assert((await text('hw-firmware')).startsWith('v0.1.0'), await text('hw-firmware'));
    await page.waitForFunction(() => document.querySelector('[data-testid="hw-mon-enabled"]')?.textContent?.startsWith('no'), null, { timeout: 3000 });
    assert((await sim('d.outputs.enabled')) === false, 'motors enabled after connect');
    await shot('04-connected-handshake');
  });

  await step('G. Validate the device profile (can arm)', async () => {
    await validate();
    assert((await page.getByTestId('hw-validation-summary').getAttribute('data-can-arm')) === 'true', 'cannot arm');
  });

  await step('H. Prepare a program', async () => {
    await page.getByTestId('hw-program').selectOption({ label: 'Physical Drive (JavaScript)' });
    await page.getByTestId('hw-prepare').click();
    await page.getByTestId('hw-message').getByText(/Prepared "Physical Drive"/).waitFor();
  });

  await step('I. Deploy the program to the simulated device (no motion)', async () => {
    await page.getByTestId('hw-deploy').click();
    await page.getByTestId('hw-deployed').getByText(/Deployed: Physical Drive/).waitFor();
    assert((await sim('d.outputs.left')) === 0, 'motion after deploy');
  });

  await step('J. Arm explicitly (refused without the safety confirmation)', async () => {
    await page.getByTestId('hw-arm').click();
    await page.getByTestId('hw-message').getByText(/Confirm that the robot is safely positioned/).waitFor();
    assert((await sim('d.state')) === 'connected', 'armed without confirmation');
    await arm();
    await shot('05-armed');
  });

  await step('K. Low-speed movement command (hold Forward)', async () => {
    const button = page.getByTestId('hw-jog-forward');
    await button.hover();
    await page.mouse.down();
    await page.waitForFunction(() => window.__araiSimulatedDevice.outputs.left > 0, null, { timeout: 3000 });
    const left = await sim('d.outputs.left');
    assert(left > 0 && left <= 75, `jog output ${left}`);
    await page.waitForFunction(() => /^\d+ \/ [1-9]/.test(document.querySelector('[data-testid="hw-mon-left"]')?.textContent ?? ''), null, { timeout: 3000 });
    assert((await hwState()) === 'running', `state ${await hwState()}`);
    await shot('06-jog-forward');
    await page.mouse.up();
    await page.waitForFunction(() => window.__araiSimulatedDevice.outputs.left === 0, null, { timeout: 3000 });
  });

  await step('L. Receive physical-format telemetry (distance, status) separate from the simulator', async () => {
    await page.waitForFunction(() => document.querySelector('[data-testid="hw-tel-distance"]')?.getAttribute('data-status') === 'ok', null, { timeout: 3000 });
    assert((await text('hw-tel-distance')).endsWith(' m'), await text('hw-tel-distance'));
    await page.evaluate(() => window.__araiSimulatedDevice.setDistance(null, 'range'));
    await page.waitForFunction(() => document.querySelector('[data-testid="hw-tel-distance"]')?.getAttribute('data-status') === 'out-of-range', null, { timeout: 3000 });
    await page.evaluate(() => window.__araiSimulatedDevice.setDistance(420, 'ok'));
    await shot('07-telemetry');
  });

  await step('M. Start the deployed program on the physical target, then Stop', async () => {
    await page.getByTestId('hw-confirm-start').check();
    await page.getByTestId('hw-start').click();
    await page.getByTestId('code-studio').waitFor();
    assert((await page.getByTestId('exec-target').inputValue()) === 'physical', 'target not physical');
    await page.waitForFunction(() => window.__araiSimulatedDevice.outputs.left > 0, null, { timeout: 5000 });
    await page.getByTestId('program-log').getByText(/distance source physical true/).waitFor({ timeout: 5000 });
    await shot('08-program-running-physical-target');
    await page.getByTestId('stop-program').click();
    await page.waitForFunction(() => window.__araiSimulatedDevice.outputs.left === 0, null, { timeout: 3000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="exec-target"]')?.value === 'simulation', null, { timeout: 3000 });
  });

  await step('N. Disconnect (stops and disarms first)', async () => {
    await goHardware();
    await page.getByTestId('hw-disconnect').click();
    await waitState('not-connected');
    assert((await sim('d.state')) === 'connected', `device ${await sim('d.state')}`);
    assert((await sim('d.outputs.enabled')) === false, 'motors still enabled');
    assert((await page.getByTestId('estop').count()) === 0, 'E-stop still shown');
  });

  await step('P1. Invalid connection: a board without the firmware fails the handshake', async () => {
    assert((await page.getByTestId('hw-method').inputValue()) === 'simulated', 'connection method was not kept');
    await page.evaluate(() => window.__araiSimulatedDevice.setSilent(true));
    await page.getByTestId('hw-connect').click();
    await page.getByTestId('hw-error').getByText(/Handshake failed/).waitFor({ timeout: 9000 });
    assert((await hwState()) === 'not-connected', `state ${await hwState()}`);
    await shot('09-handshake-failed');
    await page.evaluate(() => window.__araiSimulatedDevice.setSilent(false));
  });

  await step('P2. Communication loss while moving: firmware stops and latches a fault; reconnect does not resume', async () => {
    await page.getByTestId('hw-connect').click();
    await waitState('connected');
    await validate();
    await arm();
    const button = page.getByTestId('hw-jog-forward');
    await button.hover();
    await page.mouse.down();
    await page.waitForFunction(() => window.__araiSimulatedDevice.outputs.left > 0, null, { timeout: 3000 });
    await page.evaluate(() => window.__araiSimulatedDevice.cutLink());
    await page.waitForFunction(() => window.__araiSimulatedDevice.outputs.left === 0, null, { timeout: 2000 });
    await page.waitForFunction(() => window.__araiSimulatedDevice.state === 'fault', null, { timeout: 3000 });
    await page.mouse.up();
    await waitState('disconnected', 4000);
    await shot('10-link-lost-fault');
    await page.getByTestId('hw-reconnect').click();
    await waitState('fault');
    assert((await sim('d.outputs.enabled')) === false, 'motors enabled after reconnect');
    assert(await page.getByTestId('hw-arm').isDisabled(), 'arm allowed in fault');
    assert((await text('hw-mon-fault')).startsWith('heartbeat_timeout'), await text('hw-mon-fault'));
    await page.getByTestId('hw-clear-fault').click();
    await waitState('connected');
    assert((await sim('d.state')) === 'connected', 'not disarmed after clearing');
  });

  await step('P3. Emergency stop from the top bar: immediate, latched, explicit reset and re-arm', async () => {
    await validate();
    await arm();
    const button = page.getByTestId('hw-jog-forward');
    await button.hover();
    await page.mouse.down();
    await page.waitForFunction(() => window.__araiSimulatedDevice.outputs.left > 0, null, { timeout: 3000 });
    await page.getByTestId('estop').click();
    await page.mouse.up();
    await page.waitForFunction(() => window.__araiSimulatedDevice.state === 'estop' && !window.__araiSimulatedDevice.outputs.enabled, null, { timeout: 2000 });
    await waitState('emergency-stopped');
    assert((await page.getByTestId('estop').getAttribute('data-active')) === 'true', 'e-stop not shown active');
    await shot('11-emergency-stopped');
    assert(await page.getByTestId('hw-arm').isDisabled(), 'arm allowed during e-stop');
    await page.getByTestId('hw-reset-estop').click();
    await waitState('connected');
    assert((await sim('d.state')) === 'connected', 'device not back to disarmed');
    await page.getByTestId('hw-disconnect').click();
    await waitState('not-connected');
  });

  await step('P4. Build History records the hardware events (no telemetry samples)', async () => {
    await tab('history');
    for (const type of ['hardware.connected', 'hardware.firmware', 'hardware.profile', 'hardware.validated', 'program.prepared', 'program.deployed', 'program.started', 'program.stopped', 'hardware.fault', 'hardware.estop', 'hardware.disconnected']) {
      assert((await page.locator(`[data-testid="history-event"][data-type="${type}"]`).count()) > 0, `history lacks ${type}`);
    }
    const total = await page.locator('[data-testid="history-event"]').count();
    assert(total < 200, `history looks unbounded (${total})`);
    await shot('12-build-history-hardware');
  });

  await step('Calibration: values are saved in the profile, the 3D model is unchanged, and they survive a reload', async () => {
    await tab('hardware');
    await page.getByTestId('hw-cal-wheel').fill('69.5');
    await page.getByTestId('hw-cal-wheel').blur();
    await page.getByTestId('hw-cal-track').fill('150');
    await page.getByTestId('hw-cal-track').blur();
    await page.getByTestId('hw-cal-compare').getByText('69.5 mm').waitFor();
    assert((await page.getByTestId('hw-cal-compare').textContent()).includes('140 mm'), 'virtual wheel diameter missing');
    await page.getByTestId('save').click();
    await page.reload();
    await page.getByTestId('workspace').waitFor();
    await goHardware();
    assert((await page.getByTestId('hw-cal-wheel').inputValue()) === '69.5', 'calibration lost');
    assert((await hwState()) === 'not-connected', 'connected automatically after reload');
    await shot('13-calibration-saved');
  });

  await step('O. Existing simulator features still work (Control drive, Code Studio on Simulation, Environment Editor, cameras)', async () => {
    await page.getByTestId('mode-control').click();
    const expand = page.getByRole('button', { name: 'Expand properties panel' });
    if (await expand.isVisible().catch(() => false)) await expand.click();
    const before = await text('telemetry-position');
    await page.getByTestId('status-bar').click();
    await page.keyboard.down('w');
    await page.waitForTimeout(800);
    await page.keyboard.up('w');
    await page.waitForTimeout(200);
    assert((await text('telemetry-position')) !== before, 'robot did not move in Control Mode');
    await page.getByTestId('mode-code').click();
    await page.getByTestId('code-studio').waitFor();
    assert((await page.getByTestId('exec-target').inputValue()) === 'simulation', 'target not simulation');
    assert(await page.locator('[data-testid="exec-target"] option[value="physical"]').isDisabled(), 'physical target selectable without a device');
    await page.getByTestId('run-program').click();
    await page.getByTestId('program-log').getByText(/distance source (kinematic|physics)/).waitFor({ timeout: 8000 });
    await page.getByTestId('stop-program').click();
    await page.getByTestId('mode-environment').click();
    await page.getByTestId('environment-toolbar').waitFor();
    await page.getByTestId('mode-build').click();
    await page.getByRole('tab', { name: /^Camera/ }).click();
    await page.getByTestId('camera-add').click();
    await page.getByTestId('mode-control').click();
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="camera-feed"]')?.dataset.frames ?? 0) >= 3, null, { timeout: 15000 });
  });

  await step('Layout: Hardware tab at 900 and 600 px', async () => {
    await goHardware();
    for (const width of [900, 600]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 1, `horizontal overflow at ${width}px: ${overflow}`);
      await shot(`layout-${width}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
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
