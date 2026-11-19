/**
 * Phase 8 Camera Simulation in a real browser — the brief's workflows A–N, checked from the
 * camera's actual pixels (read from the Camera Monitor canvas), plus the Camera Monitor at
 * 900 and 600 px and browser performance measurements (printed as "[camera-perf]" lines).
 * Screenshots: docs/testing/phase-8/.
 */
import { mkdirSync } from 'node:fs';
import { assert, createProject, createSuite, launch, startServer } from './helpers.mjs';

const SHOTS = 'docs/testing/phase-8';
mkdirSync(SHOTS, { recursive: true });
const suite = createSuite('camera');
const step = (name, fn) => suite.step(name, fn);
const server = await startServer(4198);
const BASE = server.url;
let ok = false;

const NOW = '2026-11-19T00:00:00.000Z';
const base = { rotation: [0, 0, 0], mass: 1, friction: 0.8, restitution: 0.05, collision: true, visible: true, locked: false };
const groundObj = (id) => ({ ...base, id, name: 'Ground', kind: 'ground', position: [0, -0.05, 0], size: [10, 0.1, 10], body: 'static', color: '#3a4250', friction: 0.9 });
const RED = '#dc2626';
const BLUE = '#2563eb';
const GREEN = '#16a34a';
const env = (id, name, objects) => ({ id, name, version: 1, templateId: null, objects, createdAt: NOW, updatedAt: NOW });
const ENVIRONMENTS = [
  env('envd_cam_wall', 'Camera Wall', [
    groundObj('g1'),
    { ...base, id: 'w1', name: 'Red Wall', kind: 'wall', position: [2.0, 0.3, 0], size: [0.1, 0.6, 1.2], body: 'static', color: RED },
    { ...base, id: 'r1', name: 'Green Ramp', kind: 'ramp', position: [0.9, 0.06, 0.55], size: [0.4, 0.12, 0.3], body: 'static', color: GREEN },
  ]),
  env('envd_cam_occl', 'Camera Occlusion', [
    groundObj('g2'),
    { ...base, id: 'w2', name: 'Red Wall', kind: 'wall', position: [1.0, 0.3, 0], size: [0.1, 0.6, 1.0], body: 'static', color: RED },
    { ...base, id: 'b2', name: 'Blue Box', kind: 'box', position: [1.6, 0.15, 0], size: [0.3, 0.3, 0.3], body: 'static', color: BLUE },
  ]),
  env('envd_cam_box', 'Camera Box Only', [groundObj('g3'), { ...base, id: 'b3', name: 'Blue Box', kind: 'box', position: [1.6, 0.15, 0], size: [0.3, 0.3, 0.3], body: 'static', color: BLUE }]),
];

/** Pixel statistics of the Camera Monitor image. */
const feed = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('[data-testid="camera-feed"]');
    if (!c) return null;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const n = c.width * c.height;
    let red = 0;
    let blue = 0;
    let green = 0;
    let redLeft = 0;
    let redRight = 0;
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
      const x = p % c.width;
      if (r > 110 && r > 2 * g && r > 2 * b) {
        red++;
        if (x < c.width / 2) redLeft++;
        else redRight++;
      }
      if (b > 110 && b > 1.5 * r && b > 1.2 * g) blue++;
      if (g > 90 && g > 1.5 * r && g > 1.3 * b) green++;
    }
    const ci = ((c.height >> 1) * c.width + (c.width >> 1)) * 4;
    const sig = [];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const j = ((Math.floor(((y + 0.5) * c.height) / 8)) * c.width + Math.floor(((x + 0.5) * c.width) / 8)) * 4;
      sig.push(0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2]);
    }
    return { w: c.width, h: c.height, frames: Number(c.dataset.frames), source: c.dataset.source, red: red / n, blue: blue / n, green: green / n, redLeft: redLeft / n, redRight: redRight / n, center: [d[ci], d[ci + 1], d[ci + 2]], sig };
  });
const diff = (a, b) => a.sig.reduce((s, v, i) => s + Math.abs(v - b.sig[i]), 0) / a.sig.length;
const isRed = ([r, g, b]) => r > 110 && r > 2 * g && r > 2 * b;

async function measureFrames(page, ms = 3000) {
  const intervals = await page.evaluate(
    (duration) =>
      new Promise((resolve) => {
        const out = [];
        const start = performance.now();
        let last = start;
        const f = (t) => {
          out.push(t - last);
          last = t;
          if (t - start < duration) requestAnimationFrame(f);
          else resolve(out.slice(1));
        };
        requestAnimationFrame(f);
      }),
    ms,
  );
  const sorted = [...intervals].sort((a, b) => a - b);
  const total = intervals.reduce((a, b) => a + b, 0);
  return { fps: (intervals.length / total) * 1000, median: sorted[sorted.length >> 1], p95: sorted[Math.floor(sorted.length * 0.95)] };
}
const fmt = (m) => `${m.fps.toFixed(1)} FPS (median ${m.median.toFixed(1)} ms, p95 ${m.p95.toFixed(1)} ms)`;

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
    // page.goto() during a page load aborts the old page's favicon request; that is navigation, not an app error.
    const navigationAbort = r.url().endsWith('/favicon.svg') && r.failure()?.errorText === 'net::ERR_ABORTED';
    if (!sandboxTeardown && !navigationAbort) suite.consoleErrors.push(`request failed: ${r.url()} (${r.failure()?.errorText ?? ''})`);
  });
  console.log('\nPhase 8 Camera Simulation\n');

  const text = (id) => page.getByTestId(id).textContent();
  const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
  const value = (id) => page.getByTestId(id).inputValue();
  const setField = async (id, v) => {
    await page.getByTestId(id).fill(String(v));
    await page.getByTestId(id).press('Enter');
    await page.waitForTimeout(150);
  };
  const focusWorkspace = () => page.getByTestId('status-bar').click();
  const hold = async (key, ms) => {
    await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    await page.keyboard.up(key);
    await page.waitForTimeout(250);
  };
  const openCameraTab = async () => {
    await page.getByRole('tab', { name: /^Camera/ }).click();
    await page.getByTestId('camera-monitor').waitFor();
  };
  /** Wait until the feed has drawn new frames, then read it. */
  const fresh = async (min = 3) => {
    const start = (await feed(page))?.frames ?? 0;
    await page.waitForFunction((n) => Number(document.querySelector('[data-testid="camera-feed"]')?.dataset.frames ?? 0) >= n, start + min, { timeout: 10000 });
    return feed(page);
  };
  const waitSim = async (state) => {
    const expand = page.getByRole('button', { name: 'Expand properties panel' });
    if (await expand.isVisible().catch(() => false)) await expand.click();
    await page.locator(`[data-testid="simulation-panel"][data-state="${state}"]`).waitFor({ timeout: 20000 });
  };
  const usePhysicsEnv = async (id) => {
    await page.getByTestId('mode-build').click();
    await page.getByTestId('mode-simulate').click();
    await waitSim('running');
    await page.getByTestId('sim-environment').selectOption(id);
    await page.waitForTimeout(1200);
  };
  const cams = () => page.evaluate(() => window.__araiCameras());
  const runJs = async (code) => {
    await page.getByTestId('mode-code').click();
    await page.getByTestId('code-studio').waitFor();
    await page.getByTestId('lang-javascript').click();
    await page.getByTestId('js-editor').waitFor();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.insertText(code);
    await page.getByTestId('run-program').click();
  };

  // ── A. Add a camera to Explorer Bot ──
  await step('A: Inspector → Sensors → Camera adds a Camera part at the front of Explorer Bot with a working camera', async () => {
    await page.goto(BASE);
    await page.evaluate((envs) => {
      const environments = Object.fromEntries(envs.map((e) => [e.id, e]));
      localStorage.setItem('arai.environments.v1', JSON.stringify({ state: { environments }, version: 1 }));
    }, ENVIRONMENTS);
    await createProject(page, BASE, 'explorer', 'Camera Bot');
    await page.getByTestId('add-sensor-camera').click();
    await page.getByTestId('sensor-row-front-camera').waitFor();
    assert((await text('sensor-row-front-camera')).includes('Camera'), 'camera row missing');
    await page.getByTestId('sensor-front-camera-toggle').click();
    await page.getByTestId('sensor-front-camera-settings').waitFor();
    assert((await value('sensor-front-camera-resolution')) === '320x240', 'default resolution');
    await shot('01-camera-added-to-explorer-bot');
  });

  // ── C/D before B: open the monitor and see the design-pose feed ──
  await step('C: the Camera Monitor shows the live feed, status, FOV and resolution', async () => {
    await openCameraTab();
    const f = await fresh(3);
    assert(f.w === 320 && f.h === 240, `size ${f.w}×${f.h}`);
    assert(f.source === 'design', `source ${f.source}`);
    assert((await text('camera-status')) === 'live', 'not live');
    assert((await text('camera-fov')).startsWith('60°'), `fov ${await text('camera-fov')}`);
    assert((await text('camera-size')).includes('320 × 240'), 'size label');
    await shot('02-camera-monitor-design-pose');
  });

  await step('B: position and rotate the camera (part inspector and mount rotation); the image follows', async () => {
    const before = await fresh(2);
    // Position: raise the Camera part by 10 cm.
    await page.getByRole('tab', { name: /Objects/ }).click();
    await page.getByTestId('objects-panel').getByRole('button', { name: 'Front Camera', exact: true }).click();
    await page.getByTestId('object-inspector').waitFor();
    const y = Number(await value('pos-y'));
    await setField('pos-y', (y + 0.1).toFixed(3));
    const raised = await fresh(3);
    assert(diff(before, raised) > 1, 'image did not change after moving the camera up');
    // Rotation: tilt the camera down 25° through its mount rotation (about Z), in "Sensors on this part".
    await page.getByTestId('sensor-front-camera-toggle').click();
    await page.getByTestId('sensor-front-camera-rot-z').fill('-25');
    await page.getByTestId('sensor-front-camera-rot-z').press('Enter');
    await page.waitForTimeout(150);
    const tilted = await fresh(3);
    assert(diff(raised, tilted) > 3, 'image did not change after tilting the camera');
    // Back to level and the original height (undo twice).
    await page.getByTestId('undo').click();
    await page.getByTestId('undo').click();
    await page.waitForTimeout(200);
    const back = await fresh(3);
    assert(diff(before, back) < 1.5, `undo did not restore the view (diff ${diff(before, back).toFixed(2)})`);
    await shot('03-camera-position-and-rotation');
  });

  // ── D/E/F/I: physics, custom environment ──
  await step('D, I: Physics engine with a custom environment: the feed shows the red wall ahead and the green ramp at the right', async () => {
    await usePhysicsEnv('envd_cam_wall');
    await openCameraTab();
    const f = await fresh(4);
    assert(f.source === 'physics', `source ${f.source}`);
    assert(isRed(f.center), `center pixel ${f.center} is not the red wall`);
    assert(f.red > 0.03, `red wall too small (${(f.red * 100).toFixed(1)} %)`);
    assert(f.green > 0.002, `green ramp not seen (${(f.green * 100).toFixed(2)} %)`);
    console.log(`        wall ${(f.red * 100).toFixed(1)} % of the image, ramp ${(f.green * 100).toFixed(2)} %`);
    await shot('04-live-feed-red-wall-physics');
  });

  let close;
  await step('E: driving toward the wall makes it larger in the image (the feed follows the robot)', async () => {
    const far = await fresh(2);
    await focusWorkspace();
    await hold('w', 1600);
    close = await fresh(4);
    assert(close.red > far.red * 1.3 && close.red > far.red + 0.03, `wall did not grow: ${(far.red * 100).toFixed(1)} % → ${(close.red * 100).toFixed(1)} %`);
    console.log(`        wall ${(far.red * 100).toFixed(1)} % → ${(close.red * 100).toFixed(1)} % after driving forward`);
    await shot('05-feed-follows-robot-forward');
  });

  await step('F: turning left moves the wall to the right side of the image and out of the center', async () => {
    await focusWorkspace();
    await hold('a', 900);
    const turned = await fresh(4);
    assert(!isRed(turned.center), `center still red after turning (${turned.center})`);
    assert(turned.redRight > turned.redLeft, `wall should be on the right after a left turn (L ${turned.redLeft.toFixed(3)} R ${turned.redRight.toFixed(3)})`);
    assert(diff(close, turned) > 5, 'image did not change after turning');
    await shot('06-feed-after-left-turn');
  });

  await step('G: occlusion: a blue box behind the red wall is not visible; without the wall it is', async () => {
    await page.getByTestId('sim-environment').selectOption('envd_cam_occl');
    await page.waitForTimeout(1200);
    const occluded = await fresh(4);
    assert(occluded.red > 0.03, 'wall not seen');
    assert(occluded.blue < 0.0005, `blue box seen through the wall (${(occluded.blue * 100).toFixed(3)} %)`);
    await shot('07-occlusion-wall-hides-box');
    await page.getByTestId('sim-environment').selectOption('envd_cam_box');
    await page.waitForTimeout(1200);
    const visible = await fresh(4);
    assert(visible.blue > 0.003, `blue box not seen without the wall (${(visible.blue * 100).toFixed(3)} %)`);
    console.log(`        blue box: ${(occluded.blue * 100).toFixed(3)} % behind the wall, ${(visible.blue * 100).toFixed(2)} % without it`);
    await shot('08-occlusion-box-visible-without-wall');
    await page.getByTestId('sim-stop').click();
    await waitSim('stopped');
  });

  await step('H: Kinematic engine: the feed comes from the kinematic pose and changes as the robot drives', async () => {
    await page.getByTestId('mode-control').click();
    await openCameraTab();
    const a = await fresh(3);
    assert(a.source === 'kinematic', `source ${a.source}`);
    await focusWorkspace();
    await hold('w', 700);
    const b = await fresh(3);
    assert(diff(a, b) > 0.5, `image did not change while driving (diff ${diff(a, b).toFixed(2)})`);
    await hold('a', 500);
    const c = await fresh(3);
    assert(diff(b, c) > 0.5, 'image did not change while turning');
    await shot('09-kinematic-feed');
  });

  // ── J/K/L: Code Studio ──
  await step('J: JavaScript captures an image (asynchronously) and reads its data', async () => {
    await page.getByTestId('mode-simulate').click();
    await waitSim('running');
    await page.getByTestId('sim-environment').selectOption('envd_cam_wall');
    await page.waitForTimeout(1000);
    await runJs(`const cams = await robotCamera.list();
console.log("CAMS", cams.map((c) => c.id).join(","));
const before = robotControl.getState();
const f = await robotCamera.capture("front-camera");
console.log("CAP", f.width, f.height, f.format, f.data.length, f.brightness, f.meanColor.r > f.meanColor.b ? "redder" : "bluer", f.source);
const s = await robotCamera.getState("front-camera");
console.log("STATE", s.status, s.rendererReady);
try { await robotCamera.capture("no-such-camera"); } catch (e) { console.log("MISSING", e.message); }
`);
    await page.getByTestId('execution-status').filter({ hasText: 'Completed' }).waitFor({ timeout: 20000 });
    const log = await page.getByTestId('program-log').innerText();
    assert(/CAMS front-camera/.test(log), 'list failed');
    assert(/CAP 320 240 rgba 307200 [\d.]+ redder physics/.test(log), `capture line: ${log.match(/CAP.*/)?.[0]}`);
    assert(/STATE (idle|live) true/.test(log), 'state line');
    assert(/MISSING No camera with the id "no-such-camera"/.test(log), 'missing-camera error');
    await shot('10-javascript-capture');
  });

  await step('K: a Blockly camera program reads brightness and color, and receives frames', async () => {
    await page.getByTestId('lang-blockly').click();
    await page.getByTestId('blockly-editor').waitFor({ timeout: 20000 });
    await page.evaluate(() => {
      const { workspace, Blockly } = window.__araiBlockly;
      const num = (v) => ({ shadow: { type: 'math_number', fields: { NUM: v } } });
      const log = (label, value) => ({ type: 'robot_log_value', fields: { LABEL: label }, inputs: { VALUE: { block: value } } });
      const chain = (...blocks) => {
        let next;
        for (const b of [...blocks].reverse()) next = { block: { ...b, ...(next ? { next } : {}) } };
        return next;
      };
      workspace.clear();
      Blockly.serialization.workspaces.load(
        {
          blocks: {
            languageVersion: 0,
            blocks: [
              {
                type: 'robot_start',
                x: 30,
                y: 30,
                next: chain(
                  log('cameras', { type: 'camera_count' }),
                  log('ready', { type: 'camera_is_ready', fields: { SENSOR: 'front-camera' } }),
                  log('brightness', { type: 'camera_brightness', fields: { SENSOR: 'front-camera' } }),
                  log('red', { type: 'camera_color', fields: { SENSOR: 'front-camera', CHANNEL: 'r' } }),
                  { type: 'camera_on_frame', fields: { SENSOR: 'front-camera' }, inputs: { HZ: num(4), DO: chain(log('frame', { type: 'camera_frame_value', fields: { FIELD: 'frame' } })) } },
                  { type: 'robot_wait', inputs: { MS: num(1500) } },
                  { type: 'camera_unsubscribe_all' },
                ),
              },
            ],
          },
        },
        workspace,
      );
    });
    await page.getByTestId('run-program').click();
    await page.getByTestId('execution-status').filter({ hasText: 'Completed' }).waitFor({ timeout: 20000 });
    const log = await page.getByTestId('program-log').innerText();
    assert(/cameras = 1/.test(log), 'camera count');
    assert(/ready = true/.test(log), 'ready');
    assert(/brightness = [\d.]+/.test(log), 'brightness');
    assert(/red = \d+/.test(log), 'red');
    const frames = (log.match(/frame = \d+/g) ?? []).length;
    assert(frames >= 3 && frames <= 8, `frames received: ${frames}`);
    assert((await cams()).subscriptions === 0, 'Blockly left a camera subscription');
    console.log(`        Blockly: ${log.match(/brightness = [\d.]+/)[0]}, ${log.match(/red = \d+/)[0]}, ${frames} frames in 1.5 s at 4 Hz`);
    await shot('11-blockly-camera-program');
  });

  await step('L: Stop ends a program\'s camera subscription and waiting captures', async () => {
    await runJs(`await robotCamera.subscribe("front-camera", (f) => {}, { maxHz: 5, format: "none" });
console.log("SUBSCRIBED");
while (true) { await robotCamera.capture("front-camera", { format: "none" }); await wait(100); }
`);
    await page.getByTestId('program-log').getByText('Program: SUBSCRIBED', { exact: true }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);
    assert((await cams()).subscriptions === 1, 'subscription not active');
    await page.getByTestId('stop-program').click();
    await page.getByTestId('execution-status').filter({ hasText: /Stopped|Idle/ }).waitFor();
    await page.waitForTimeout(300);
    const d = await cams();
    assert(d.subscriptions === 0 && d.pendingCaptures === 0, `after Stop: ${JSON.stringify(d)}`);
    await shot('12-program-stopped-cleanup');
  });

  // ── M. Save, reload ──
  await step('M: save, reload the browser: the camera configuration and part are restored', async () => {
    await page.getByTestId('mode-build').click();
    await page.getByRole('tab', { name: /Components/ }).click().catch(() => {});
    const toggle = page.getByTestId('sensor-front-camera-toggle');
    if (!(await page.getByTestId('sensor-front-camera-settings').isVisible().catch(() => false))) await toggle.click();
    await page.getByTestId('sensor-front-camera-resolution').selectOption('160x120');
    await setField('sensor-front-camera-hfov', 75);
    await page.getByTestId('save').click();
    await page.waitForTimeout(500);
    await page.reload();
    await page.getByTestId('workspace').waitFor();
    await page.waitForTimeout(800);
    await page.getByTestId('sensor-front-camera-toggle').click();
    assert((await value('sensor-front-camera-resolution')) === '160x120', 'resolution not restored');
    assert(Number(await value('sensor-front-camera-hfov')) === 75, 'field of view not restored');
    await openCameraTab();
    const f = await fresh(2);
    assert(f.w === 160 && f.h === 120, `restored feed is ${f.w}×${f.h}`);
    await shot('13-saved-and-reloaded-camera');
  });

  // ── Layout ──
  for (const width of [900, 600]) {
    await step(`Camera Monitor at ${width} px: no horizontal overflow; feed and controls usable`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(500);
      await openCameraTab();
      await fresh(2);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 0, `page overflows by ${overflow}px`);
      for (const id of ['camera-feed', 'camera-select', 'camera-pause', 'camera-resolution']) {
        const box = await page.getByTestId(id).boundingBox();
        assert(box && box.width > 0 && box.x >= 0 && box.x + box.width <= width + 1, `${id} cut off at ${width}px`);
      }
      await shot(`14-camera-monitor-${width}px`);
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(400);

  await step('Pause / resume: a paused feed renders nothing for the monitor', async () => {
    await openCameraTab();
    await fresh(2);
    await page.getByTestId('camera-pause').click();
    await page.waitForTimeout(400);
    const a = (await feed(page)).frames;
    await page.waitForTimeout(800);
    assert((await feed(page)).frames === a, 'frames kept coming while paused');
    assert((await text('camera-status')) === 'paused', 'status not paused');
    await page.getByTestId('camera-pause').click();
    await fresh(2);
  });

  // ── Performance (browser; software WebGL in this environment) ──
  await step('Performance: monitor closed vs open, presets, two cameras, capture rate, memory after repeated capture/Stop cycles', async () => {
    const lines = [];
    const expand = page.getByRole('button', { name: 'Expand properties panel' });
    if (await expand.isVisible().catch(() => false)) await expand.click();
    await page.getByTestId('mode-build').click();
    await page.getByRole('tab', { name: /^Console/ }).click();
    await page.waitForTimeout(3500); // idle release
    const closed = await measureFrames(page);
    lines.push(`monitor closed: ${fmt(closed)}; render targets ${(await cams()).renderTargets}`);
    for (const preset of ['160x120', '320x240', '640x480']) {
      const toggle = page.getByTestId('sensor-front-camera-toggle');
      if (!(await page.getByTestId('sensor-front-camera-settings').isVisible().catch(() => false))) await toggle.click();
      await page.getByTestId('sensor-front-camera-rate').selectOption('30');
      await page.getByTestId('sensor-front-camera-resolution').selectOption(preset);
      await openCameraTab();
      await fresh(3);
      const open = await measureFrames(page);
      const camFps = await text('camera-fps');
      lines.push(`monitor open ${preset} @30 Hz: ${fmt(open)}; camera ${camFps}`);
    }
    // Two active cameras: the monitor shows one, a program subscribes to the other.
    await page.getByTestId('mode-build').click();
    await page.getByTestId('add-sensor-camera').click();
    await page.getByTestId('sensor-row-camera').waitFor();
    await runJs(`await robotCamera.subscribe("camera", () => {}, { maxHz: 5, format: "none" });\nawait wait(6000);`);
    await openCameraTab();
    await fresh(3);
    const two = await measureFrames(page);
    lines.push(`two cameras (monitor 640x480 @30 Hz + program 5 Hz): ${fmt(two)}; render targets ${(await cams()).renderTargets}`);
    await page.getByTestId('stop-program').click();
    // Capture rate: as fast as the limit allows (5 per second per run).
    await runJs(`let n = 0, refused = 0; const t0 = Date.now();
while (Date.now() - t0 < 3000) { try { await robotCamera.capture("front-camera", { format: "none" }); n++; } catch (e) { refused++; await wait(50); } }
console.log("CAPRATE", (n / ((Date.now() - t0) / 1000)).toFixed(2), refused);`);
    await page.getByTestId('execution-status').filter({ hasText: 'Completed' }).waitFor({ timeout: 20000 });
    await page.getByRole('tab', { name: /^Program/ }).click();
    const rate = (await page.getByTestId('program-log').innerText()).match(/CAPRATE ([\d.]+) (\d+)/);
    lines.push(`capture frequency: ${rate[1]} captures/s accepted (limit 5/s), ${rate[2]} refused by the limit`);
    assert(Number(rate[1]) <= 5.5, 'capture limit not enforced');
    // Memory after repeated capture + Stop cycles.
    const heap = () => page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
    const before = await heap();
    for (let i = 0; i < 10; i++) {
      await runJs(`for (let i = 0; i < 4; i++) await robotCamera.capture("front-camera");\nawait robotCamera.subscribe("front-camera", () => {}, { maxHz: 5 });\nawait wait(5000);`);
      await page.waitForTimeout(700);
      await page.getByTestId('stop-program').click();
      await page.getByTestId('execution-status').filter({ hasText: /Stopped|Idle|Completed/ }).waitFor();
    }
    await page.getByRole('tab', { name: /^Console/ }).click();
    await page.waitForTimeout(3500);
    const after = await heap();
    const d = await cams();
    lines.push(`10 capture/Stop cycles (40 RGBA captures at 640×480 + 10 subscriptions): JS heap ${before ? (before / 1e6).toFixed(1) : '?'} → ${after ? (after / 1e6).toFixed(1) : '?'} MB; subscriptions ${d.subscriptions}, pending ${d.pendingCaptures}, render targets ${d.renderTargets} (monitor closed)`);
    assert(d.subscriptions === 0 && d.pendingCaptures === 0, 'leftover demand');
    assert(d.renderTargets === 0, `render targets not released: ${d.renderTargets}`);
    for (const l of lines) console.log(`[camera-perf] ${l}`);
    await page.getByTestId('sim-stop').click().catch(() => {});
  });

  // ── N. Old project without a camera ──
  await step('N: an old project without a camera opens; the Camera tab shows the empty state', async () => {
    const legacy = {
      id: 'prj_oldcam', name: 'Old Explorer', category: 'mobile', templateId: 'explorer-bot', schemaVersion: 3,
      objects: [{ id: 'obj_c', name: 'Chassis', category: 'chassis', geometry: { shape: 'box', size: [0.4, 0.1, 0.26] }, color: '#3B82F6', transform: { position: [0, 0.11, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, visible: true, parentId: null, metadata: { componentId: 'chassis-rect', description: '', createdAt: NOW } }],
      joints: [], actuators: [], controllers: [], createdAt: NOW, updatedAt: NOW, savedAt: NOW,
    };
    await page.evaluate((p) => {
      const raw = JSON.parse(localStorage.getItem('arai.projects.v1'));
      raw.state.projects[p.id] = p;
      localStorage.setItem('arai.projects.v1', JSON.stringify(raw));
    }, legacy);
    await page.goto(`${BASE}/workspace/prj_oldcam`);
    await page.getByTestId('workspace').waitFor();
    await page.waitForTimeout(800);
    await openCameraTab();
    await page.getByTestId('camera-empty').waitFor();
    await page.getByTestId('camera-add').waitFor();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('arai.projects.v1')).state.projects.prj_oldcam);
    assert(!('sensors' in stored), 'opening changed the old project');
    await shot('15-old-project-without-camera');
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
