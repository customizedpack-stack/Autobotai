/**
 * Phase 7 final verification in a real browser (checks not covered by environment.e2e.mjs):
 * V1 the Environment Editor at 1440, 900 and 600 px; V2 an old project without environmentId;
 * V3 Stop disposes the physics world, the loop and sensor subscriptions; V4 sandbox programs
 * cannot reach environment or physics internals; V5 browser frame times with 10, 25 and 50
 * environment objects (Edit Mode and Test Mode). Screenshots go to docs/testing/phase-7/verification/.
 * Frame times are printed as "[frames] …" lines for the report.
 */
import { mkdirSync } from 'node:fs';
import { assert, canvasStats, createProject, createSuite, launch, startServer } from './helpers.mjs';

const SHOTS = 'docs/testing/phase-7/verification';
mkdirSync(SHOTS, { recursive: true });
const suite = createSuite('verification');
const step = (name, fn) => suite.step(name, fn);
const server = await startServer(4195);
const BASE = server.url;
let ok = false;

/** A mixed environment of `count` objects (1 ground + walls, boxes, platforms, ramps, pillars), every box dynamic. */
function perfEnvironment(count) {
  const now = new Date().toISOString();
  const base = { rotation: [0, 0, 0], mass: 1, friction: 0.8, restitution: 0.05, collision: true, visible: true, locked: false };
  const objects = [{ ...base, id: `g${count}`, name: 'Ground', kind: 'ground', position: [0, -0.05, 0], size: [16, 0.1, 16], body: 'static', color: '#3a4250', friction: 0.9 }];
  const kinds = ['wall', 'box', 'platform', 'ramp', 'obstacle'];
  for (let i = 1; i < count; i++) {
    const kind = kinds[i % kinds.length];
    const ring = 1.6 + Math.floor((i - 1) / 12) * 1.1;
    const angle = (((i - 1) % 12) / 12) * Math.PI * 2;
    const at = [Math.cos(angle) * ring, Math.sin(angle) * ring];
    const o = { ...base, id: `o${count}_${i}`, name: `${kind} ${i}`, kind, color: '#64748b' };
    if (kind === 'wall') Object.assign(o, { position: [at[0], 0.2, at[1]], size: [0.1, 0.4, 0.8], body: 'static', rotation: [0, angle, 0] });
    if (kind === 'box') Object.assign(o, { position: [at[0], 0.1, at[1]], size: [0.2, 0.2, 0.2], body: 'dynamic', mass: 1.5 });
    if (kind === 'platform') Object.assign(o, { position: [at[0], 0.03, at[1]], size: [0.5, 0.06, 0.5], body: 'static' });
    if (kind === 'ramp') Object.assign(o, { position: [at[0], 0.06, at[1]], size: [0.5, 0.12, 0.5], body: 'static', friction: 0.9 });
    if (kind === 'obstacle') Object.assign(o, { shape: 'cylinder', position: [at[0], 0.2, at[1]], size: [0.16, 0.4, 0.16], body: 'static' });
    objects.push(o);
  }
  return { id: `perf${count}`, name: `Perf ${count}`, version: 1, templateId: null, objects, createdAt: now, updatedAt: now };
}

/** requestAnimationFrame intervals over `ms` milliseconds: frames, FPS, median and 95th-percentile frame time. */
async function measureFrames(page, ms = 4000) {
  const intervals = await page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const out = [];
        const start = performance.now();
        let last = start;
        const frame = (now) => {
          out.push(now - last);
          last = now;
          if (now - start < duration) requestAnimationFrame(frame);
          else resolve(out.slice(1));
        };
        requestAnimationFrame(frame);
      }),
    ms,
  );
  const sorted = [...intervals].sort((a, b) => a - b);
  const total = intervals.reduce((a, b) => a + b, 0);
  return {
    frames: intervals.length,
    fps: (intervals.length / total) * 1000,
    median: sorted[Math.floor(sorted.length / 2)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
  };
}

const fmt = (m) => `${m.fps.toFixed(1)} FPS, median ${m.median.toFixed(1)} ms, p95 ${m.p95.toFixed(1)} ms (${m.frames} frames)`;

async function newPage(browser, width, height = 900) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addInitScript(() => {
    window.__ARAI_E2E__ = true;
  });
  const page = await context.newPage();
  suite.watch(page);
  page.on('requestfailed', (r) => {
    const sandboxTeardown = r.url().startsWith('blob:null/') && r.failure()?.errorText === 'net::ERR_ABORTED';
    if (!sandboxTeardown) suite.consoleErrors.push(`request failed: ${r.url()} (${r.failure()?.errorText ?? ''})`);
  });
  return { context, page };
}

const diagnostics = (page) => page.evaluate(() => window.__araiSimulation());
const listeners = (page) => page.evaluate(() => window.__araiSensorListeners());
/** The Simulation panel lives in the right panel; open the panel if it was collapsed earlier. */
async function waitSim(page, state) {
  const expand = page.getByRole('button', { name: 'Expand properties panel' });
  if (await expand.isVisible().catch(() => false)) await expand.click();
  await page.locator(`[data-testid="simulation-panel"][data-state="${state}"]`).waitFor({ timeout: 20000 });
}
/** Control Mode with the Physics engine running (from any mode). */
async function controlPhysics(page) {
  await page.getByTestId('mode-build').click();
  await page.getByTestId('mode-simulate').click();
  await waitSim(page, 'running');
}

async function runJs(page, source) {
  await page.getByTestId('mode-code').click();
  await page.getByTestId('code-studio').waitFor();
  await page.getByTestId('lang-javascript').click();
  await page.getByTestId('js-editor').waitFor();
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.keyboard.insertText(source);
  await page.getByTestId('run-program').click();
}

try {
  const browser = await launch();
  console.log('\nPhase 7 final verification\n');

  // ── V1: Environment Editor at 1440, 900 and 600 px ──
  for (const width of [1440, 900, 600]) {
    await step(`V1 ${width} px: Environment Editor opens, a template and an object can be added, nothing overflows, toolbar and inspector are usable`, async () => {
      const { context, page } = await newPage(browser, width);
      try {
        await createProject(page, BASE, 'explorer', `Width ${width} Bot`);
        const compact = (await page.getByTestId('workspace').getAttribute('data-compact')) === 'true';
        assert(compact === width < 1024, `compact layout ${compact} at ${width} px`);
        await page.getByTestId('mode-environment').click();
        await page.getByTestId('environment-toolbar').waitFor();
        const openLeft = async () => {
          if (compact) {
            await page.getByRole('button', { name: 'Expand left panel' }).click();
            await page.getByTestId('left-drawer').waitFor();
          }
        };
        const closeLeft = async () => {
          if (compact) await page.getByTestId('left-drawer-backdrop').click({ position: { x: width - 10, y: 400 } });
        };
        await openLeft();
        await page.getByRole('tab', { name: 'Environments' }).click();
        await page.getByTestId('env-template-arena').click();
        await page.getByRole('tab', { name: 'Library' }).click();
        await page.getByTestId('env-add-box').click();
        await closeLeft();
        await page.waitForTimeout(400);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert(overflow <= 0, `page overflows by ${overflow}px`);
        for (const id of ['env-mode-badge', 'env-name', 'env-save', 'env-test']) {
          const box = await page.getByTestId(id).boundingBox();
          assert(box && box.width > 0, `${id} not visible`);
          assert(box.x >= 0 && box.x + box.width <= width + 1, `${id} cut off (x ${box.x.toFixed(0)}, w ${box.width.toFixed(0)})`);
        }
        const save = await page.getByTestId('save').boundingBox();
        assert(save.x + save.width <= width + 1, 'top bar Save button cut off');
        const stats = await canvasStats(page);
        assert(stats.distinct > 40, 'viewport blank');
        await page.screenshot({ path: `${SHOTS}/v1-environment-editor-${width}.png` });
        if (compact) {
          await page.getByRole('button', { name: 'Expand properties panel' }).click();
          await page.getByTestId('right-drawer').waitFor();
        }
        await page.getByTestId('environment-object-inspector').waitFor();
        const name = await page.getByTestId('env-insp-name').boundingBox();
        assert(name && name.x >= 0 && name.x + name.width <= width + 1, 'inspector name field cut off');
        await page.getByTestId('env-insp-size-0').fill('0.5');
        await page.getByTestId('env-insp-size-0').press('Enter');
        assert((await page.getByTestId('env-insp-size-0').inputValue()).startsWith('0.5'), 'inspector edit did not apply');
        await page.screenshot({ path: `${SHOTS}/v1-environment-inspector-${width}.png` });
      } finally {
        await context.close();
      }
    });
  }

  const { context, page } = await newPage(browser, 1440);

  // ── V2: old projects without environmentId ──
  await step('V2: a project saved without environmentId (pre-Phase 7) opens with the empty environment, runs physics and opens the editor', async () => {
    await createProject(page, BASE, 'explorer', 'Legacy Bot');
    const projectId = page.url().split('/workspace/')[1];
    const removed = await page.evaluate((id) => {
      const raw = JSON.parse(localStorage.getItem('arai.projects.v1'));
      const had = 'environmentId' in raw.state.projects[id];
      delete raw.state.projects[id].environmentId;
      localStorage.setItem('arai.projects.v1', JSON.stringify(raw));
      return { had, version: raw.version, schema: raw.state.projects[id].schemaVersion };
    }, projectId);
    await page.reload();
    await page.getByTestId('workspace').waitFor();
    await page.waitForTimeout(800);
    const stored = await page.evaluate((id) => JSON.parse(localStorage.getItem('arai.projects.v1')).state.projects[id], projectId);
    assert(stored && !('environmentId' in stored), 'opening alone must not rewrite the old project');
    await page.getByTestId('mode-simulate').click();
    await waitSim(page, 'running');
    assert((await page.getByTestId('sim-environment').inputValue()) === 'floor', 'old project did not get the empty environment');
    const d = await diagnostics(page);
    assert(d.liveWorlds === 1 && d.environmentBodies === 0, `unexpected world ${JSON.stringify(d)}`);
    await page.getByTestId('sim-stop').click();
    await page.getByTestId('mode-environment').click();
    await page.getByTestId('environment-toolbar').waitFor();
    console.log(`        old project: environmentId present before removal ${removed.had}; store version ${removed.version}; schema ${removed.schema}`);
  });

  await step('V2b: a project pointing at a deleted environment falls back to the empty environment', async () => {
    const projectId = page.url().split('/workspace/')[1];
    await page.evaluate((id) => {
      const raw = JSON.parse(localStorage.getItem('arai.projects.v1'));
      raw.state.projects[id].environmentId = 'envd_doesnotexist';
      localStorage.setItem('arai.projects.v1', JSON.stringify(raw));
    }, projectId);
    await page.reload();
    await page.getByTestId('workspace').waitFor();
    await page.getByTestId('mode-simulate').click();
    await waitSim(page, 'running');
    assert((await page.getByTestId('sim-environment').inputValue()) === 'floor', 'missing environment did not fall back');
    await page.getByTestId('sim-stop').click();
    await waitSim(page, 'stopped');
  });

  // ── V3: Stop disposes the world, the loop and subscriptions; no duplicate worlds ──
  await step('V3: one physics world at a time; Reset and environment changes never duplicate it; Stop disposes world and loop', async () => {
    await page.getByTestId('mode-simulate').click();
    await waitSim(page, 'running');
    await page.getByTestId('sim-environment').selectOption('arena');
    await page.waitForTimeout(500);
    let d = await diagnostics(page);
    assert(d.liveWorlds === 1 && d.controller && d.loopRunning, `running: ${JSON.stringify(d)}`);
    assert(d.environmentBodies === 7, `arena should build 7 objects, got ${d.environmentBodies}`);
    const bodiesBefore = d.rigidBodies;
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('sim-reset').click();
      await page.waitForTimeout(400);
    }
    await page.getByTestId('sim-environment').selectOption('obstacles');
    await page.waitForTimeout(400);
    await page.getByTestId('sim-environment').selectOption('arena');
    await page.waitForTimeout(400);
    d = await diagnostics(page);
    assert(d.liveWorlds === 1, `duplicate worlds after Reset / environment change: ${d.liveWorlds}`);
    assert(d.rigidBodies === bodiesBefore, `rigid bodies ${d.rigidBodies} vs ${bodiesBefore} (duplicates?)`);
    await page.getByTestId('sim-stop').click();
    await waitSim(page, 'stopped');
    await page.waitForTimeout(300);
    d = await diagnostics(page);
    assert(d.liveWorlds === 0 && !d.controller && !d.loopRunning, `after Stop: ${JSON.stringify(d)}`);
    console.log(`        running world: ${bodiesBefore} rigid bodies; after Stop: ${JSON.stringify(d)}`);
  });

  await step('V3b: Stop ends program sensor subscriptions; the listener count returns to its value before the run', async () => {
    await controlPhysics(page);
    await page.getByTestId('mode-code').click();
    await page.waitForTimeout(400);
    const before = await listeners(page);
    await runJs(
      page,
      `await robotSensors.imu("main-imu").subscribe(() => {});
await robotSensors.encoder("left-encoder").subscribe(() => {});
console.log("subscribed");
await wait(20000);
`,
    );
    await page.getByTestId('program-log').getByText('Program: subscribed', { exact: true }).waitFor({ timeout: 15000 });
    const during = await listeners(page);
    assert(during >= before + 2, `subscriptions not active: ${before} → ${during}`);
    await page.getByTestId('stop-program').click();
    await page.getByTestId('execution-status').filter({ hasText: /Stopped|Idle/ }).waitFor();
    await page.waitForTimeout(300);
    const after = await listeners(page);
    assert(after === before, `listeners leaked: before ${before}, during ${during}, after ${after}`);
    // Leaving the live session (Build Mode) also ends the simulation and frees the world.
    await page.getByTestId('mode-build').click();
    await page.waitForTimeout(400);
    const d = await diagnostics(page);
    assert(d.liveWorlds === 0 && !d.loopRunning, `world left after leaving the session: ${JSON.stringify(d)}`);
    console.log(`        sensor listeners: before ${before}, during ${during}, after program Stop ${after}, after leaving the session ${await listeners(page)}`);
  });

  // ── V4: sandbox isolation ──
  await step('V4: sandbox programs cannot reach environment, physics or storage internals; sensor readings are plain data', async () => {
    await controlPhysics(page);
    await runJs(
      page,
      `const names = ["window","document","parent","top","opener","localStorage","sessionStorage","indexedDB","fetch","XMLHttpRequest","WebSocket","importScripts","RAPIER","Rapier","PhysicsWorld","physicsWorld","world","simulationManager","useEnvironmentStore","environment","environments","robotEnvironment","__araiSimulation","__araiSensorListeners","__ARAI_E2E__"];
const exposed = names.filter((n) => typeof globalThis[n] !== "undefined");
console.log("PROBED " + names.length + " EXPOSED " + JSON.stringify(exposed));
console.log("SUSPECT " + JSON.stringify(Object.getOwnPropertyNames(globalThis).filter((n) => /rapier|physic|environ|collider|rigid|arai|zustand/i.test(n))));
console.log("SENSORS " + JSON.stringify(Object.keys(robotSensors).sort()));
console.log("CONTROL " + JSON.stringify(Object.keys(robotControl).sort()));
const r = await robotSensors.distance("front-distance").read();
const plain = JSON.stringify(r) === JSON.stringify(JSON.parse(JSON.stringify(r)));
const fns = Object.values(r).filter((v) => typeof v === "function").length;
console.log("READING " + JSON.stringify(Object.keys(r).sort()) + " plain=" + plain + " functions=" + fns);
`,
    );
    await page.getByTestId('program-log').getByText(/READING/).waitFor({ timeout: 20000 });
    const log = (await page.getByTestId('program-log').innerText()).replace(/\n/g, ' ');
    const grab = (tag) => {
      const m = log.match(new RegExp(`${tag}\\s+(\\[.*?\\]|\\{.*?\\})`));
      assert(m, `${tag} line missing from the program log`);
      return JSON.parse(m[1]);
    };
    const exposed = grab('EXPOSED');
    assert(exposed.length === 0, `exposed in the sandbox: ${JSON.stringify(exposed)}`);
    const probed = Number(log.match(/PROBED (\d+)/)[1]);
    const suspect = grab('SUSPECT');
    assert(suspect.length === 0, `suspicious globals: ${suspect.join(', ')}`);
    const sensorsApi = grab('SENSORS');
    const controlApi = grab('CONTROL');
    assert(!sensorsApi.concat(controlApi).some((k) => /environ|physic|world|rapier|collider/i.test(k)), 'API exposes internals');
    assert(/plain=true functions=0/.test(log), 'sensor reading is not plain data');
    console.log(`        robotSensors keys: ${sensorsApi.join(', ')}; robotControl keys: ${controlApi.join(', ')}`);
    console.log(`        globals probed: ${probed}, all undefined; reading keys: ${grab('READING').join(', ')}`);
    await page.screenshot({ path: `${SHOTS}/v4-sandbox-isolation.png` });
    await page.getByTestId('mode-build').click();
  });

  // ── V5: browser frame times with 10, 25 and 50 environment objects ──
  await page.evaluate((envs) => {
    const raw = JSON.parse(localStorage.getItem('arai.environments.v1') ?? '{"state":{"environments":{}},"version":1}');
    for (const env of envs) raw.state.environments[env.id] = env;
    localStorage.setItem('arai.environments.v1', JSON.stringify(raw));
  }, [10, 25, 50].map(perfEnvironment));
  await page.reload();
  await page.getByTestId('workspace').waitFor();
  await page.waitForTimeout(1000);

  await step('V5 baseline: frame time with the empty environment (Edit Mode and physics running)', async () => {
    await page.getByTestId('mode-build').click();
    await page.waitForTimeout(800);
    const idle = await measureFrames(page);
    await controlPhysics(page);
    await page.getByTestId('sim-environment').selectOption('floor');
    await page.waitForTimeout(1000);
    const running = await measureFrames(page);
    console.log(`[frames] empty environment | Build Mode: ${fmt(idle)} | Physics running: ${fmt(running)}`);
    await page.getByTestId('sim-stop').click();
    await waitSim(page, 'stopped');
  });

  for (const count of [10, 25, 50]) {
    await step(`V5 ${count} objects: every object is built; frame time in Edit Mode and in Test Mode recorded`, async () => {
      await page.getByTestId('mode-environment').click();
      await page.getByTestId('environment-toolbar').waitFor();
      await page.getByRole('tab', { name: 'Environments' }).click();
      await page.getByTestId(`env-saved-Perf ${count}`).getByRole('button', { name: 'Open', exact: true }).click();
      await page.getByTestId('env-name').filter({ hasText: `Perf ${count}` }).waitFor();
      await page.waitForTimeout(1200);
      const edit = await measureFrames(page);
      await page.screenshot({ path: `${SHOTS}/v5-edit-${count}-objects.png` });
      await page.getByTestId('env-test').click();
      await waitSim(page, 'running');
      await page.waitForTimeout(1500);
      const d = await diagnostics(page);
      assert(d.liveWorlds === 1 && d.environmentBodies === count, `built ${d.environmentBodies} of ${count}: ${JSON.stringify(d)}`);
      const test = await measureFrames(page);
      const info = (await page.getByTestId('sim-info').innerText()).replace(/\s+/g, ' ');
      await page.screenshot({ path: `${SHOTS}/v5-test-${count}-objects.png` });
      console.log(`[frames] ${count} objects (${d.colliders} colliders) | Edit Mode: ${fmt(edit)} | Test Mode: ${fmt(test)} | ${info}`);
      await page.getByTestId('sim-stop').click();
      await waitSim(page, 'stopped');
      assert((await diagnostics(page)).liveWorlds === 0, 'world left after Stop');
    });
  }

  await step('No browser console errors', async () => {
    assert(suite.consoleErrors.length === 0, `console errors: ${suite.consoleErrors.slice(0, 3).join(' | ')}`);
  });

  await context.close();
  await browser.close();
  ok = suite.summary();
} catch (error) {
  console.error(error);
} finally {
  server.stop();
}
process.exit(ok ? 0 : 1);
