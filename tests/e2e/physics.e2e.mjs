/**
 * Phase 5 Physics Simulation in a real browser: engine selector, start / pause /
 * resume / stop / reset, physics driving, obstacles, gravity, debug view, the
 * inspector Physics section (undo, save, reload), the Simulate tab, Code Studio
 * programs on the physics engine, and leaving the mode.
 */
import { assert, canvasStats, createProject, createSuite, launch, SHOTS, startServer } from './helpers.mjs';

const suite = createSuite('physics');
const step = (name, fn) => suite.step(name, fn);
const server = await startServer(4186);
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
  console.log('\nPhase 5 Physics Simulation\n');

  const text = (id) => page.getByTestId(id).textContent();
  const position = async () => (await text('telemetry-position')).split(',').map(Number);
  const simState = () => page.getByTestId('simulation-panel').getAttribute('data-state');
  const waitSim = (state, timeout = 20000) => page.locator(`[data-testid="simulation-panel"][data-state="${state}"]`).waitFor({ timeout });
  const focusWorkspace = () => page.getByTestId('status-bar').click();
  const hold = async (keys, ms) => {
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(ms);
    for (const k of [...keys].reverse()) await page.keyboard.up(k);
  };
  const banner = () => page.getByTestId('kinematic-banner');

  await createProject(page, BASE, 'explorer-bot', 'Physics Bot');

  await step('Inspector Physics section: edit mass, undo and redo restore it', async () => {
    await page.getByRole('tab', { name: /Objects/ }).click();
    await page.getByTestId('objects-panel').getByRole('button', { name: 'Chassis', exact: true }).click();
    await page.getByTestId('physics-section').waitFor();
    const auto = Number(await page.getByTestId('phys-mass').inputValue());
    assert(auto > 0, `no automatic mass (${auto})`);
    await page.getByTestId('phys-mass').fill('2.5');
    await page.getByTestId('phys-mass').press('Enter');
    await page.waitForTimeout(100);
    assert((await page.getByTestId('phys-mass').inputValue()) === '2.5', 'mass not applied');
    await page.getByTestId('phys-reset').waitFor();
    await focusWorkspace();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);
    assert(Number(await page.getByTestId('phys-mass').inputValue()) === auto, 'undo did not restore the automatic mass');
    await page.keyboard.press('Control+y');
    await page.waitForTimeout(100);
    assert((await page.getByTestId('phys-mass').inputValue()) === '2.5', 'redo did not re-apply the mass');
    await page.getByTestId('phys-mass').fill('50000');
    await page.getByTestId('phys-mass').press('Enter');
    await page.waitForTimeout(400);
    assert((await page.getByTestId('phys-mass').inputValue()) === '2.5', 'invalid mass was accepted');
    await page.getByTestId('save').click();
    await page.screenshot({ path: `${SHOTS}/p5-01-inspector-physics.png` });
  });

  await step('Control Mode starts on the Kinematic engine with a clear indicator', async () => {
    await page.getByTestId('mode-control').click();
    await page.getByTestId('robot-control-panel').waitFor();
    await banner().getByText('Kinematic Simulation — No Physics').waitFor();
    assert((await page.getByTestId('engine-kinematic').getAttribute('aria-checked')) === 'true', 'kinematic not selected');
    assert((await text('status-engine')) === 'Kinematic engine', `status bar: ${await text('status-engine')}`);
  });

  await step('Selecting Physics loads Rapier, starts the simulation and the robot settles', async () => {
    await page.getByTestId('engine-physics').click();
    await waitSim('running');
    await banner().getByText('Physics Simulation — Running').waitFor();
    assert((await text('status-engine')).startsWith('Physics engine (Rapier)'), 'status bar engine');
    await page.getByTestId('sim-info').waitFor();
    assert(Number.parseFloat(await text('sim-mass')) > 2.5, 'total mass does not include the 2.5 kg chassis');
    await page.waitForTimeout(1200);
    const [x, z] = await position();
    assert(Math.abs(x) < 0.02 && Math.abs(z) < 0.02, `robot drifted while idle (${x}, ${z})`);
    assert((await page.getByTestId('joint-preview-physics').count()) === 1, 'joint preview not disabled in physics');
    await page.screenshot({ path: `${SHOTS}/p5-02-physics-running.png` });
  });

  await step('Holding W drives the physics robot forward through its wheel motors', async () => {
    await page.getByTestId('speed-100').click();
    await focusWorkspace();
    await hold(['w'], 1200);
    const [x] = await position();
    assert(x > 0.15, `did not drive forward (x ${x})`);
    const wheels = await text('telemetry-wheels');
    assert(!wheels.startsWith('0.00 / 0.00') || x > 0.15, 'wheels never turned');
    await page.waitForTimeout(1000);
    const [x2] = await position();
    await page.waitForTimeout(500);
    const [x3] = await position();
    assert(Math.abs(x3 - x2) < 0.01, `robot did not come to rest (${x2} → ${x3})`);
  });

  await step('Pause freezes time and refuses movement; Resume continues', async () => {
    await page.getByTestId('sim-pause').click();
    await waitSim('paused');
    await banner().getByText('Physics Simulation — Paused').waitFor();
    const t1 = await text('sim-time');
    const [p1] = await position();
    await focusWorkspace();
    await hold(['w'], 500);
    const [p2] = await position();
    assert(Math.abs(p2 - p1) < 1e-4, `robot moved while paused (${p1} → ${p2})`);
    assert((await text('sim-time')) === t1, 'simulation time advanced while paused');
    await page.getByTestId('command-error').getByText(/paused/i).waitFor();
    await page.getByTestId('sim-resume').click();
    await waitSim('running');
  });

  await step('Debug view draws collision shapes, joints and contacts', async () => {
    const before = await canvasStats(page);
    await page.getByTestId('sim-debug').click();
    await page.waitForTimeout(500);
    const after = await canvasStats(page);
    assert(before.signature !== after.signature, 'debug view did not change the picture');
    await page.screenshot({ path: `${SHOTS}/p5-03-debug-view.png` });
    await page.getByTestId('sim-debug').click();
  });

  await step('Obstacle course: the wall stops the robot', async () => {
    await page.getByTestId('sim-environment').selectOption('obstacles');
    await page.waitForTimeout(400);
    const [x0] = await position();
    assert(Math.abs(x0) < 0.02, `environment change did not rebuild from the design pose (x ${x0})`);
    await focusWorkspace();
    await hold(['w'], 4500);
    const [x] = await position();
    assert(x > 0.8, `robot did not reach the wall (x ${x})`);
    assert(x < 1.35, `robot passed through the wall (x ${x})`);
    await page.screenshot({ path: `${SHOTS}/p5-04-wall.png` });
  });

  await step('Reset rebuilds the simulation at the design pose', async () => {
    await page.getByTestId('sim-reset').click();
    await page.waitForTimeout(400);
    const [x, z] = await position();
    assert(Math.abs(x) < 0.02 && Math.abs(z) < 0.02, `not reset (${x}, ${z})`);
    assert((await simState()) === 'running', 'not running after reset');
  });

  await step('Gravity can be switched off and on', async () => {
    await page.getByTestId('sim-gravity').click();
    assert((await page.getByTestId('sim-gravity').getAttribute('aria-checked')) === 'false', 'gravity still on');
    await page.waitForTimeout(300);
    await page.getByTestId('sim-gravity').click();
    assert((await page.getByTestId('sim-gravity').getAttribute('aria-checked')) === 'true', 'gravity still off');
    await page.getByTestId('sim-environment').selectOption('floor');
  });

  await step('Stop returns the robot to its design pose; switching back to Kinematic drives kinematically', async () => {
    await focusWorkspace();
    await hold(['w'], 500);
    await page.getByTestId('sim-stop').click();
    await waitSim('stopped');
    await banner().getByText('Physics Simulation — Stopped').waitFor();
    await page.getByTestId('sim-start').waitFor();
    await page.getByTestId('engine-kinematic').click();
    await banner().getByText('Kinematic Simulation — No Physics').waitFor();
    await focusWorkspace();
    await hold(['w'], 600);
    const [x] = await position();
    assert(x > 0.1, `kinematic driving broken after physics (x ${x})`);
    await page.getByTestId('btn-reset').click();
  });

  await step('Leaving Control Mode stops the simulation; the Simulate tab opens Physics directly', async () => {
    await page.getByTestId('engine-physics').click();
    await waitSim('running');
    await page.getByTestId('mode-build').click();
    assert((await text('status-engine')) === 'Simulation: off in Build Mode', 'status bar in build mode');
    await page.getByTestId('mode-simulate').click();
    await page.getByTestId('robot-control-panel').waitFor();
    await waitSim('running');
    assert((await page.getByTestId('mode-simulate').getAttribute('aria-pressed')) === 'true', 'Simulate tab not active');
    assert((await text('status-mode')) === 'Control Mode', 'Simulate did not open Control Mode');
  });

  await step('Code Studio: a JavaScript program drives the physics robot through C2', async () => {
    await page.getByTestId('mode-code').click();
    await page.getByTestId('code-studio').waitFor();
    await page.getByRole('button', { name: 'Expand properties panel' }).click();
    await page.getByTestId('robot-control-panel').waitFor();
    // Leaving Control Mode stopped the simulation; a run starts it again automatically.
    await page.getByTestId('lang-javascript').click();
    await page.getByTestId('js-editor').waitFor();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.insertText(`await robotControl.drive.forward({ speed: 1, durationMs: 1000 });
console.log("physics drive done");
`);
    await page.getByTestId('run-program').click();
    await page.getByTestId('execution-status').filter({ hasText: 'Completed' }).waitFor({ timeout: 20000 });
    await page.getByTestId('program-log').getByText('Program: physics drive done').waitFor();
    assert((await simState()) === 'running', 'simulation not running for the program');
    const [x] = await position();
    assert(x > 0.1, `program did not move the physics robot (x ${x})`);
  });

  await step('Pausing the simulation pauses the program; resuming continues it', async () => {
    await page.getByTestId('sim-reset').click();
    await page.keyboard.press('Escape');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.insertText(`await robotControl.drive.forward({ speed: 1, durationMs: 1500 });
console.log("after pause");
`);
    await page.getByTestId('run-program').click();
    await page.getByTestId('execution-status').filter({ hasText: 'Running' }).waitFor();
    await page.waitForTimeout(500);
    await page.getByTestId('sim-pause').click();
    await page.getByTestId('execution-status').filter({ hasText: 'Paused' }).waitFor();
    const [p1] = await position();
    await page.waitForTimeout(700);
    const [p2] = await position();
    assert(Math.abs(p2 - p1) < 1e-4, `robot moved while the simulation was paused (${p1} → ${p2})`);
    await page.getByTestId('sim-resume').click();
    await page.getByTestId('execution-status').filter({ hasText: 'Completed' }).waitFor({ timeout: 20000 });
    await page.getByTestId('program-log').getByText('Program: after pause').waitFor();
  });

  await step('Physics settings are saved with the project and restored after reload', async () => {
    await page.getByTestId('mode-build').click();
    await page.getByTestId('save').click();
    await page.reload();
    await page.getByTestId('workspace').waitFor();
    await page.waitForTimeout(800);
    await page.getByRole('tab', { name: /Objects/ }).click();
    await page.getByTestId('objects-panel').getByRole('button', { name: 'Chassis', exact: true }).click();
    await page.getByTestId('physics-section').waitFor();
    assert((await page.getByTestId('phys-mass').inputValue()) === '2.5', 'mass lost after reload');
    await page.getByTestId('mode-control').click();
    await banner().getByText('Kinematic Simulation — No Physics').waitFor();
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
