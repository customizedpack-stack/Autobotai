/**
 * Phase 3 Robot Movement & Control: Build/Control modes, keyboard and on-screen
 * driving, speed, stop/reset, actuators, joint preview, apply pose, saving,
 * and v2 -> v3 migration in a real browser.
 */
import { assert, createProject, createSuite, launch, SHOTS, startServer } from './helpers.mjs';

const suite = createSuite('control');
const step = (name, fn) => suite.step(name, fn);
const server = await startServer(4184);
const BASE = server.url;
let ok = false;

try {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  suite.watch(page);
  console.log('\nPhase 3 Robot Movement & Control\n');

  const text = (id) => page.getByTestId(id).textContent();
  const position = async () => (await text('telemetry-position')).split(',').map(Number);
  const heading = async () => Number.parseFloat(await text('telemetry-heading'));
  const distance = async () => Number.parseFloat(await text('telemetry-distance'));
  const focusWorkspace = () => page.getByTestId('status-bar').click();
  const hold = async (keys, ms) => {
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(ms);
    for (const k of [...keys].reverse()) await page.keyboard.up(k);
    await page.waitForTimeout(150);
  };
  const holdButton = async (testId, ms) => {
    const b = await page.getByTestId(testId).boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(ms);
    await page.mouse.up();
    await page.waitForTimeout(150);
  };

  await page.goto(BASE);
  await createProject(page, BASE, 'explorer-bot', 'Control Bot');

  await step('Build Mode is the default; W selects the Move tool and does not drive', async () => {
    assert((await text('status-mode')) === 'Build Mode', 'not in build mode');
    await focusWorkspace();
    await page.keyboard.press('q');
    await page.keyboard.press('w');
    assert((await page.getByRole('button', { name: 'Move tool' }).getAttribute('aria-pressed')) === 'true', 'W did not select the Move tool');
    assert((await page.getByTestId('robot-control-panel').count()) === 0, 'control panel shown in build mode');
  });

  await step('Explorer Bot comes with DC motors on its wheel joints; motor limits can be edited', async () => {
    await page.getByRole('tab', { name: /Objects/ }).click();
    await page.getByTestId('objects-panel').getByRole('button', { name: 'Select joint Left Wheel Joint' }).click();
    await page.getByTestId('actuator-editor').waitFor();
    assert((await page.getByTestId('actuator-type').inputValue()) === 'dcMotor', 'not a DC motor');
    await page.getByTestId('actuator-velocity').fill('15');
    await page.getByTestId('actuator-velocity').press('Enter');
    assert((await page.getByTestId('actuator-velocity').inputValue()) === '15', 'max velocity not applied');
    await page.getByTestId('objects-panel').getByRole('button', { name: 'Select joint Sensor Mount' }).click();
    await page.getByTestId('actuator-section').getByText('Fixed joints cannot be driven').waitFor();
    await page.getByTestId('save').click();
    await page.screenshot({ path: `${SHOTS}/p3-01-actuator.png` });
  });

  await step('Switching to Control Mode shows the control panel, the kinematic label and locks editing', async () => {
    await page.getByTestId('mode-control').click();
    await page.getByTestId('robot-control-panel').waitFor();
    await page.getByTestId('kinematic-banner').getByText('Kinematic Simulation — No Physics').waitFor();
    await page.getByTestId('edit-lock').waitFor();
    assert((await text('status-mode')) === 'Control Mode', 'status bar not updated');
    assert((await page.getByTestId('transform-tools').count()) === 0, 'transform tools still shown');
    assert((await text('movement-status')) === 'idle', 'not idle');
  });

  await step('Holding W drives forward; releasing stops', async () => {
    await focusWorkspace();
    await page.keyboard.down('w');
    await page.waitForTimeout(800);
    assert((await text('movement-status')) === 'moving', 'not moving while W held');
    const wheels = await text('telemetry-wheels');
    await page.keyboard.up('w');
    await page.waitForTimeout(200);
    const [x, z] = await position();
    assert(x > 0.1, `did not move forward (x ${x})`);
    assert(Math.abs(z) < 0.001, `drifted sideways (z ${z})`);
    assert(!wheels.startsWith('0.00 / 0.00'), `wheels did not turn (${wheels})`);
    assert((await text('movement-status')) === 'idle', 'still moving after release');
    await page.screenshot({ path: `${SHOTS}/p3-02-driving.png` });
  });

  await step('S drives backward, A / D turn left / right, W + A drives an arc', async () => {
    const x0 = (await position())[0];
    await hold(['s'], 500);
    assert((await position())[0] < x0, 'S did not reverse');
    const h0 = await heading();
    await hold(['a'], 500);
    const h1 = await heading();
    assert(h1 > h0 + 10, `A did not turn left (${h0} -> ${h1})`);
    await hold(['ArrowRight'], 500);
    assert((await heading()) < h1 - 10, 'Right arrow did not turn right');
    const before = await position();
    await hold(['w', 'a'], 600);
    const after = await position();
    assert(Math.hypot(after[0] - before[0], after[1] - before[1]) > 0.05, 'W+A did not move');
  });

  await step('Space stops immediately and R resets to the design pose', async () => {
    await page.keyboard.down('w');
    await page.waitForTimeout(300);
    await page.keyboard.press(' ');
    const stopped = await position();
    await page.waitForTimeout(400);
    await page.keyboard.up('w');
    assert((await text('movement-status')) === 'stopped', 'not stopped');
    const still = await position();
    assert(still[0] === stopped[0] && still[1] === stopped[1], 'kept moving after Space');
    await page.keyboard.press('r');
    await page.waitForTimeout(150);
    assert((await text('telemetry-position')) === '0.000, 0.000', `reset failed (${await text('telemetry-position')})`);
    assert((await heading()) === 0, 'heading not reset');
    assert((await distance()) === 0, 'distance not reset');
  });

  await step('On-screen buttons: press and hold to drive and turn, Stop and Reset', async () => {
    await holdButton('btn-forward', 600);
    const x = (await position())[0];
    assert(x > 0.08, `Forward button did not drive (x ${x})`);
    assert((await text('movement-status')) === 'idle', 'still moving after button release');
    await holdButton('btn-right', 500);
    assert((await heading()) < -10, 'Right button did not turn right');
    await holdButton('btn-left', 1000);
    assert((await heading()) > 10, 'Left button did not turn left');
    await page.getByTestId('btn-stop').click();
    assert((await text('movement-status')) === 'stopped', 'Stop button failed');
    await page.getByTestId('btn-reset').click();
    assert((await text('telemetry-position')) === '0.000, 0.000', 'Reset button failed');
  });

  await step('Speed slider and presets change how fast the robot moves', async () => {
    await page.getByTestId('speed-25').click();
    assert((await text('speed-value')) === '25%', 'preset not applied');
    await focusWorkspace();
    await hold(['w'], 800);
    const slow = await distance();
    await page.getByTestId('btn-reset').click();
    await page.getByTestId('speed-100').click();
    await focusWorkspace();
    await hold(['w'], 800);
    const fast = await distance();
    assert(fast > slow * 2.5, `100% (${fast}) not much faster than 25% (${slow})`);
    await page.getByTestId('speed-slider').fill('60');
    assert((await text('speed-value')) === '60%', 'slider not applied');
    assert((await text('status-movement')).includes('60%'), 'status bar speed not shown');
    await page.getByTestId('btn-reset').click();
    assert((await text('telemetry-position')) === '0.000, 0.000', 'reset button did not reset');
  });

  await step('Typing in a field never drives the robot', async () => {
    await page.getByTestId('preview-input').click();
    await page.keyboard.type('wasd');
    await page.waitForTimeout(300);
    assert((await text('telemetry-position')) === '0.000, 0.000', 'robot moved while typing');
    await page.getByTestId('preview-input').fill('');
  });

  await step('A disabled motor rejects driving with a clear error', async () => {
    await page.getByTestId('btn-reset').click();
    await page.getByRole('switch', { name: 'Disable Left Drive Motor' }).click();
    try {
      await focusWorkspace();
      await hold(['w'], 300);
      await page.getByTestId('command-error').getByText(/Motor "Left Drive Motor" is disabled/).waitFor();
      assert((await text('telemetry-position')) === '0.000, 0.000', 'robot moved with a disabled motor');
      await page.getByTestId('console-log').getByText(/Command "drive" rejected/).first().waitFor();
    } finally {
      await page.getByRole('switch', { name: 'Enable Left Drive Motor' }).click();
    }
  });

  await step('Commands appear in the Bus Events panel', async () => {
    await focusWorkspace();
    await hold(['w'], 200);
    await page.getByRole('tab', { name: /Bus Events/ }).click();
    await page.getByTestId('events-log').getByText('command.accepted').first().waitFor();
    await page.getByTestId('events-log').getByText('command.status').first().waitFor();
    await page.getByTestId('events-log').getByText('command.rejected').first().waitFor();
    await page.getByRole('tab', { name: /Console/ }).click();
  });

  await step('Joint preview: revolute slider, limits, invalid value, neutral; fixed joints have no slider', async () => {
    await page.getByTestId('btn-reset').click();
    const options = await page.getByTestId('preview-joint-select').evaluate((el) => [...el.options].map((o) => o.textContent));
    assert(!options.some((o) => o.includes('Sensor Mount')), 'fixed joint offered for preview');
    await page.getByTestId('preview-joint-select').selectOption({ label: 'Left Wheel Joint (revolute)' });
    assert((await text('preview-limits')).includes('-180.0') && (await text('preview-limits')).includes('180.0'), 'limits not shown');
    await page.getByTestId('preview-slider').fill('90');
    assert((await text('preview-value')) === '90.0 °', `slider value ${await text('preview-value')}`);
    await page.getByTestId('preview-input').fill('400');
    await page.getByTestId('preview-input').press('Enter');
    await page.getByTestId('preview-error').getByText(/upper limit/).waitFor();
    assert((await text('preview-value')) === '90.0 °', 'invalid value applied');
    await page.getByTestId('preview-input').fill('-45');
    await page.getByTestId('preview-input').press('Enter');
    assert((await text('preview-value')) === '-45.0 °', 'typed value not applied');
    await page.screenshot({ path: `${SHOTS}/p3-03-joint-preview.png` });
    await page.getByTestId('preview-neutral').click();
    assert((await text('preview-value')) === '0.0 °', 'neutral failed');
  });

  await step('Apply pose saves the driven position into the design (undoable)', async () => {
    await focusWorkspace();
    await hold(['w'], 500);
    await page.getByTestId('btn-apply-pose').click();
    await page.getByTestId('mode-build').click();
    await page.getByRole('tab', { name: /Objects/ }).click();
    await page.getByTestId('objects-panel').getByRole('button', { name: 'Chassis', exact: true }).click();
    const x = Number(await page.getByTestId('pos-x').inputValue());
    assert(x > 0.05, `pose not applied (pos-x ${x})`);
    await page.getByTestId('undo').click();
    assert((await page.getByTestId('pos-x').inputValue()) === '0', 'undo did not restore');
  });

  await step('M toggles the mode; Build Mode editing works again', async () => {
    await focusWorkspace();
    await page.keyboard.press('m');
    await page.getByTestId('robot-control-panel').waitFor();
    await page.keyboard.press('m');
    await page.getByTestId('transform-tools').waitFor();
    assert((await text('status-mode')) === 'Build Mode', 'M did not return to build');
  });

  await step('Actuator settings survive save and reload', async () => {
    await page.getByTestId('save').click();
    await page.reload();
    await page.getByTestId('workspace').waitFor();
    await page.getByRole('tab', { name: /Objects/ }).click();
    await page.getByTestId('objects-panel').getByRole('button', { name: 'Select joint Left Wheel Joint' }).click();
    assert((await page.getByTestId('actuator-velocity').inputValue()) === '15', 'max velocity lost');
    await page.getByTestId('mode-control').click();
    assert((await page.getByTestId('actuator-status').locator('li').count()) === 2, 'actuators lost');
  });

  await step('A schema v2 project is upgraded to v3 and can drive', async () => {
    await page.getByTestId('mode-build').click();
    await page.getByTestId('save').click();
    await page.evaluate(() => {
      const store = JSON.parse(localStorage.getItem('arai.projects.v1'));
      for (const p of Object.values(store.state.projects)) {
        delete p.actuators;
        delete p.controllers;
        p.schemaVersion = 2;
      }
      store.version = 2;
      localStorage.setItem('arai.projects.v1', JSON.stringify(store));
    });
    await page.reload();
    await page.getByTestId('workspace').waitFor();
    await page.getByTestId('console-log').getByText(/Upgraded 1 project\(s\) from schema v2 to v3/).waitFor();
    await page.getByTestId('mode-control').click();
    assert((await page.getByTestId('actuator-status').locator('li').count()) === 2, 'default actuators not added');
    await focusWorkspace();
    await hold(['w'], 400);
    assert((await position())[0] > 0.03, 'migrated robot cannot drive');
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
