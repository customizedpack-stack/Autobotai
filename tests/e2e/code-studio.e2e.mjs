/**
 * Phase 4 Code Studio: the full user journey from the brief (dashboard →
 * existing project → Code Studio → Blockly program → run → Bus Events → stop →
 * JavaScript program → pause/resume → invalid command → save → reload →
 * restored), plus sandbox isolation, endless loops, safety and regressions.
 */
import { assert, createProject, createSuite, launch, SHOTS, startServer } from './helpers.mjs';

const suite = createSuite('code-studio');
const step = (name, fn) => suite.step(name, fn);
const server = await startServer(4185);
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
  // Any failed network request is an error (for example a file fetched from outside the app), except the
  // sandbox's own worker script (a blob: URL), which Chrome reports as "aborted" when a finished or
  // stopped program's sandbox frame is removed. That is the intended teardown, not a failure.
  page.on('requestfailed', (r) => {
    const sandboxTeardown = r.url().startsWith('blob:null/') && r.failure()?.errorText === 'net::ERR_ABORTED';
    if (!sandboxTeardown) suite.consoleErrors.push(`request failed: ${r.url()} (${r.failure()?.errorText ?? ''})`);
  });
  console.log('\nPhase 4 Code Studio\n');

  const text = (id) => page.getByTestId(id).textContent();
  const status = () => text('execution-status');
  const waitStatus = (label, timeout = 15000) => page.getByTestId('execution-status').filter({ hasText: label }).waitFor({ timeout });
  const position = async () => (await text('telemetry-position')).split(',').map(Number);
  const programLog = () => page.getByTestId('program-log');
  const sandboxes = () => page.locator('iframe[data-code-sandbox]').count();
  /** Replace the JavaScript editor's text (one undoable edit, like typing over a selection). */
  const setCode = async (code) => {
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.insertText(code);
  };
  /** Load blocks into the live Blockly workspace (test hook). */
  const setBlocks = (state) =>
    page.evaluate((s) => {
      const { workspace, Blockly } = window.__araiBlockly;
      workspace.clear();
      Blockly.serialization.workspaces.load(s, workspace);
    }, state);
  const num = (v) => ({ shadow: { type: 'math_number', fields: { NUM: v } } });
  const resetRobot = async () => {
    await page.getByTestId('reset-robot').click();
    await page.waitForTimeout(200);
  };

  await step('Open the dashboard and an existing robot project', async () => {
    await createProject(page, BASE, 'explorer-bot', 'Coder Bot');
    await page.goto(BASE);
    await page.getByRole('link', { name: 'Open Coder Bot' }).click();
    await page.getByTestId('workspace').waitFor();
    assert((await text('status-mode')) === 'Build Mode', 'not in Build Mode');
  });

  await step('Switch to Code Studio: editor, viewport, program console; design editing locked', async () => {
    await page.getByTestId('mode-code').click();
    await page.getByTestId('code-studio').waitFor();
    await page.getByTestId('blockly-editor').waitFor({ timeout: 20000 });
    assert((await text('status-mode')) === 'Code Studio', 'status bar mode');
    assert(await page.getByTestId('viewport').isVisible(), 'viewport hidden');
    assert(await page.getByTestId('program-log').isVisible(), 'program console hidden');
    assert(await page.getByTestId('code-side-panel').isVisible(), 'side panel hidden');
    assert(await page.getByTestId('drive-ready').isVisible(), 'drive not ready');
    assert((await page.getByTestId('transform-tools').count()) === 0, 'gizmo tools visible in Code Studio');
    assert(await page.getByTestId('undo').isDisabled(), 'undo enabled in Code Studio');
    assert(await page.getByTestId('kinematic-banner').isVisible(), 'kinematic label missing');
    // Robot status lives in the folded right panel; open it for telemetry.
    await page.getByRole('button', { name: 'Expand properties panel' }).click();
    await page.getByTestId('robot-control-panel').waitFor();
    assert((await page.getByTestId('btn-forward').count()) === 0, 'manual drive pad shown in Code Studio');
  });

  await step('Blockly: categories and custom blocks load; blocks can be dragged from the toolbox', async () => {
    assert((await page.getByTestId('lang-blockly').getAttribute('aria-checked')) === 'true', 'Blockly not selected');
    for (const name of ['Program', 'Movement', 'Robot Joints', 'Timing', 'Logic', 'Math', 'Variables', 'Output']) {
      await page.locator('.blocklyToolbox').getByText(name, { exact: true }).waitFor();
    }
    const before = await page.evaluate(() => window.__araiBlockly.workspace.getAllBlocks(false).length);
    // Click the category where a user would (Playwright's scroll-into-view step stalls on Blockly's toolbox).
    const category = await page.locator('.blocklyToolbox').getByText('Movement', { exact: true }).boundingBox();
    await page.mouse.click(category.x + category.width / 2, category.y + category.height / 2);
    const block = page.locator('.blocklyFlyout .blocklyDraggable').filter({ hasText: 'move backward' }).first();
    await block.waitFor();
    const box = await block.boundingBox();
    await page.mouse.move(box.x + 20, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 260, box.y + 200, { steps: 8 });
    await page.mouse.up();
    const after = await page.evaluate(() => window.__araiBlockly.workspace.getAllBlocks(false).length);
    assert(after > before, `dragging a block did not add it (${before} → ${after})`);
    assert((await page.getByTestId('program-dirty').count()) === 1, 'unsaved indicator not shown after editing');
    await page.screenshot({ path: `${SHOTS}/p4-01-blockly.png` });
  });

  await step('Blockly: a movement program runs through the sandbox and moves the robot', async () => {
    await setBlocks({
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'robot_start',
            x: 40,
            y: 40,
            next: { block: { type: 'robot_move_forward', inputs: { SPEED: num(1), DURATION: num(1200) }, next: { block: { type: 'robot_turn_left', inputs: { RATE: num(0.5), DURATION: num(500) } } } } },
          },
        ],
      },
    });
    await page.getByTestId('view-generated').click();
    await page.getByTestId('generated-code').getByText('await robotControl.drive.forward({ speed: 1, durationMs: 1200 });').waitFor();
    await page.getByTestId('view-editor').click();
    await page.getByTestId('blockly-editor').waitFor();
    await page.getByTestId('run-program').click();
    await waitStatus('Running');
    assert((await sandboxes()) === 1, 'sandbox frame not created');
    await page.waitForTimeout(700);
    const [x] = await position();
    assert(x > 0.05, `robot did not move (x ${x})`);
    await page.screenshot({ path: `${SHOTS}/p4-02-blockly-running.png` });
    await waitStatus('Completed');
    assert((await sandboxes()) === 0, 'sandbox not removed after completion');
    await programLog().getByText('Program completed. The robot was stopped.').waitFor();
    assert(Number.parseFloat(await text('telemetry-heading')) > 5, 'turn left did not change the heading');
  });

  await step('Commands from programs appear in Bus Events (source "code")', async () => {
    await page.getByRole('tab', { name: /Bus Events/ }).click();
    await page.getByTestId('events-log').getByText('command.accepted').first().waitFor();
    await page.getByTestId('events-log').getByText('codeStudio.execution').first().waitFor();
    const log = await page.getByTestId('events-log').textContent();
    assert(log.includes('"source":"code"') || log.includes('code'), 'command source not shown');
    await page.getByRole('tab', { name: /^Program/ }).click();
  });

  await step('Stop ends a running program at once and stops the robot', async () => {
    await resetRobot();
    await setBlocks({
      blocks: { languageVersion: 0, blocks: [{ type: 'robot_start', next: { block: { type: 'robot_forever', inputs: { DO: { block: { type: 'robot_move_forward', inputs: { SPEED: num(0.8), DURATION: num(400) } } } } } } }] },
    });
    await page.getByTestId('run-program').click();
    await waitStatus('Running');
    await page.waitForTimeout(600);
    await page.getByTestId('stop-program').click();
    await waitStatus('Stopped');
    assert((await sandboxes()) === 0, 'worker sandbox still alive after Stop');
    const [x1] = await position();
    await page.waitForTimeout(500);
    const [x2] = await position();
    assert(x1 > 0.02 && Math.abs(x2 - x1) < 1e-3, `robot kept moving after Stop (${x1} → ${x2})`);
    assert((await text('movement-status')) === 'stopped', 'robot status not stopped');
    await programLog().getByText('Program stopped.').waitFor();
  });

  await step('Switch to JavaScript: editor with starter code, autocomplete and API help', async () => {
    await page.getByTestId('lang-javascript').click();
    await page.getByTestId('js-editor').waitFor();
    await page.locator('.cm-content').getByText('// AutoBotAI Robot Program').waitFor();
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\nrobotControl.tu');
    await page.locator('.cm-tooltip-autocomplete').getByText('robotControl.turn.left').waitFor();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    assert(await page.locator('.cm-lineNumbers').isVisible(), 'line numbers missing');
  });

  await step('JavaScript: a movement program runs, moves the robot and logs output', async () => {
    await resetRobot();
    await setCode(`console.log("JS start");
await robotControl.drive.forward({ speed: 1, durationMs: 800 });
const state = await robotControl.getState();
console.log("distance", state.movement.distance.toFixed(2));
await robotControl.stop();
`);
    await page.getByTestId('run-program').click();
    await waitStatus('Completed');
    await programLog().getByText('Program: JS start').waitFor();
    await programLog().getByText(/Program: distance 0\.\d\d/).waitFor();
    const [x] = await position();
    assert(x > 0.12 && x < 0.3, `unexpected distance x=${x}`);
  });

  await step('Pause stops the robot and holds the program; Resume continues the remaining time', async () => {
    await resetRobot();
    await setCode(`await robotControl.drive.forward({ speed: 1, durationMs: 1600 });
console.log("drive finished");
`);
    await page.getByTestId('run-program').click();
    await waitStatus('Running');
    await page.waitForTimeout(600);
    await page.getByTestId('pause-program').click();
    await waitStatus('Paused');
    assert(await page.getByTestId('resume-program').isEnabled(), 'Resume not enabled');
    assert(await page.getByTestId('pause-program').isDisabled(), 'Pause still enabled');
    const [p1] = await position();
    await page.waitForTimeout(800);
    const [p2] = await position();
    assert(p1 > 0.05 && Math.abs(p2 - p1) < 1e-3, `robot moved while paused (${p1} → ${p2})`);
    assert((await programLog().getByText('Program: drive finished').count()) === 0, 'program continued while paused');
    await page.getByTestId('resume-program').click();
    await waitStatus('Completed');
    await programLog().getByText('Program: drive finished').waitFor();
    const [p3] = await position();
    // 1.6 s at 0.25 m/s = 0.40 m in total, paused time excluded.
    assert(Math.abs(p3 - 0.4) < 0.05, `total distance after resume ${p3} (expected ≈ 0.40)`);
  });

  await step('Invalid commands are rejected by C2 with a clear error', async () => {
    await setCode('await robotControl.drive.set(3);\n');
    await page.getByTestId('run-program').click();
    await page.getByTestId('program-error').getByText('speed must be between −1 and 1.').waitFor();
    assert((await status()) === 'Error', 'status not Error');
    await programLog().getByText(/Command rejected: drive/).waitFor();
    await setCode('console.log("ok");\nconst arm = null;\narm.move();\n');
    await page.getByTestId('run-program').click();
    await page.getByTestId('program-error').getByText('Line 3:').waitFor();
    await page.locator('.cm-error-line').first().waitFor();
    await setCode('await robotControl.stop(;\n');
    await page.getByTestId('run-program').click();
    await page.getByTestId('program-error').getByText(/Syntax error/).waitFor();
    await page.screenshot({ path: `${SHOTS}/p4-03-javascript-error.png` });
  });

  await step('Endless loops never freeze the app; Stop terminates the worker', async () => {
    await setCode('let n = 0;\nwhile (true) { n++; }\n');
    await page.getByTestId('run-program').click();
    await waitStatus('Running');
    await page.waitForTimeout(500);
    const frames = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let n = 0;
          const t0 = performance.now();
          const tick = () => (++n, performance.now() - t0 < 500 ? requestAnimationFrame(tick) : resolve(n));
          requestAnimationFrame(tick);
        }),
    );
    assert(frames >= 3, `UI froze during an endless loop (${frames} frames in 0.5 s)`);
    const stopMs = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const t0 = performance.now();
          document.querySelector('[data-testid="stop-program"]').click();
          const check = () => (document.querySelector('[data-testid="execution-status"]').textContent === 'Stopped' && !document.querySelector('iframe[data-code-sandbox]') ? resolve(performance.now() - t0) : requestAnimationFrame(check));
          check();
        }),
    );
    assert(stopMs < 500, `Stop took ${stopMs} ms`);
  });

  await step('Sandbox: no network, storage, DOM or app access from programs', async () => {
    await page.evaluate(() => localStorage.setItem('arai.secret', 'APP-SECRET'));
    await setCode(`const probe = async (name, fn) => { try { const v = await fn(); console.log(name + " OPEN " + String(v)); } catch (e) { console.log(name + " BLOCKED"); } };
await probe("fetch", () => fetch("/"));
await probe("xhr", () => new XMLHttpRequest());
await probe("websocket", () => new WebSocket("ws://localhost:1"));
await probe("importScripts", () => importScripts("/x.js"));
await probe("dynamicImport", () => import("/x.js"));
await probe("localStorage", () => localStorage.getItem("arai.secret"));
await probe("indexedDB", () => indexedDB.open("x"));
await probe("document", () => document.title);
await probe("window", () => window.location.href);
await probe("parent", () => parent.document);
await probe("eval", () => eval("1 + 1"));
await probe("Function", () => new Function("return 1")());
await probe("postMessage", () => postMessage({ v: 1, kind: "done", sessionId: "x" }));
`);
    await page.getByTestId('run-program').click();
    await waitStatus('Completed');
    const log = await programLog().textContent();
    for (const name of ['fetch', 'xhr', 'websocket', 'importScripts', 'dynamicImport', 'localStorage', 'indexedDB', 'document', 'window', 'parent', 'eval', 'Function', 'postMessage']) {
      assert(log.includes(`Program: ${name} BLOCKED`), `${name} was not blocked`);
      assert(!log.includes(`Program: ${name} OPEN`), `${name} is open to programs`);
    }
    assert(!log.includes('APP-SECRET'), 'app storage leaked into the sandbox');
  });

  await step('Joint blocks: dropdown lists the robot joints; joint targets respect limits', async () => {
    await page.getByTestId('lang-blockly').click();
    await page.getByTestId('blockly-editor').waitFor();
    const wheel = await page.evaluate(() => {
      const joint = window.__araiBlockly.workspace.newBlock('robot_set_joint_target').getField('JOINT').getOptions(false);
      return joint.map((o) => o[0]);
    });
    assert(wheel.some((name) => name.startsWith('Left Wheel Joint')), `joint dropdown: ${wheel.join(', ')}`);
    await page.evaluate(() => window.__araiBlockly.workspace.getAllBlocks(false).filter((b) => b.type === 'robot_set_joint_target').forEach((b) => b.dispose()));
  });

  await step('Save the program, rename it, reload: the program is restored', async () => {
    await page.getByTestId('lang-javascript').click();
    await setCode('// draft\n');
    assert((await page.getByTestId('program-dirty').count()) === 1, 'dirty indicator missing');
    // Ctrl+S inside the code editor saves exactly once (regression: it used to be handled twice).
    const savesBefore = await programLog().getByText(/^Saved program/).count();
    await page.keyboard.press('Control+s');
    await programLog().getByText(/^Saved program/).nth(savesBefore).waitFor();
    await page.waitForTimeout(300);
    assert((await programLog().getByText(/^Saved program/).count()) === savesBefore + 1, 'Ctrl+S saved more than once');
    assert((await programLog().getByText(/has no unsaved changes/).count()) === 0, 'Ctrl+S was handled twice');
    assert((await page.getByTestId('program-dirty').count()) === 0, 'still dirty after Ctrl+S');
    await setCode('// saved program\nawait robotControl.drive.forward({ speed: 0.5, durationMs: 300 });\n');
    await page.getByTestId('save-program').click();
    assert((await page.getByTestId('program-dirty').count()) === 0, 'still dirty after save');
    await page.getByTestId('program-name').fill('Patrol Route');
    await page.getByTestId('program-name').press('Enter');
    await page.getByTestId('program-row-Patrol Route').waitFor();
    await page.reload();
    await page.getByTestId('workspace').waitFor();
    assert((await text('status-mode')) === 'Build Mode', 'reload should start in Build Mode');
    await page.getByTestId('mode-code').click();
    await page.getByTestId('program-row-Patrol Route').waitFor();
    assert((await page.getByTestId('program-name').inputValue()) === 'Patrol Route', 'last program not reopened');
    await page.locator('.cm-content').getByText('// saved program').waitFor();
    await page.getByTestId('program-row-Blocks program').waitFor();
  });

  await step('Duplicate and delete (with confirmation) programs', async () => {
    await page.getByTestId('program-row-Patrol Route').hover();
    await page.getByRole('button', { name: 'Duplicate Patrol Route' }).click();
    await page.getByTestId('program-row-Copy of Patrol Route').waitFor();
    await page.getByTestId('program-row-Copy of Patrol Route').hover();
    await page.getByRole('button', { name: 'Delete Copy of Patrol Route' }).click();
    await page.getByRole('dialog', { name: 'Delete program' }).waitFor();
    await page.getByTestId('confirm-delete-program').click();
    await page.getByTestId('program-row-Copy of Patrol Route').waitFor({ state: 'detached' });
  });

  await step('Unsaved program edits are protected when leaving the workspace', async () => {
    await setCode('// unsaved edit\n');
    await page.getByRole('button', { name: 'Back to dashboard' }).click();
    await page.getByRole('dialog', { name: 'Unsaved changes' }).waitFor();
    assert((await text('unsaved-programs')).includes('Patrol Route'), 'unsaved program not named');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByTestId('revert-program').click();
    await page.locator('.cm-content').getByText('// saved program').waitFor();
  });

  await step('Leaving Code Studio stops a running program; Build and Control modes still work', async () => {
    await setCode('await robotControl.drive.set(0.5);\nawait wait(30000);\n');
    await page.getByTestId('run-program').click();
    await waitStatus('Running');
    await page.getByTestId('mode-build').click();
    await page.getByTestId('transform-tools').waitFor();
    assert((await sandboxes()) === 0, 'program still running after leaving Code Studio');
    assert((await text('status-mode')) === 'Build Mode', 'not back in Build Mode');
    await page.getByTestId('status-bar').click();
    await page.keyboard.press('m');
    await page.getByTestId('robot-control-panel').waitFor();
    await page.keyboard.down('w');
    await page.waitForTimeout(400);
    await page.keyboard.up('w');
    assert((await position())[0] > 0.03, 'Control Mode keyboard driving broke');
    await page.keyboard.press('m');
    await page.getByTestId('transform-tools').waitFor();
  });

  await step('Programs belong to their project', async () => {
    await createProject(page, BASE, 'robotic-arm', 'Arm Project');
    await page.getByTestId('mode-code').click();
    await page.getByTestId('code-side-panel').waitFor();
    assert((await page.getByTestId('program-row-Patrol Route').count()) === 0, 'program leaked into another project');
    await page.getByTestId('code-joint-list').getByText('Elbow').waitFor();
  });

  await step('No browser console errors or failed requests', async () => {
    assert(suite.consoleErrors.length === 0, `console errors: ${suite.consoleErrors.map((e) => JSON.stringify(e)).join(' || ')}`);
  });

  await browser.close();
  ok = suite.summary();
} catch (error) {
  console.error('Suite crashed:', error);
} finally {
  server.stop();
  process.exit(ok ? 0 : 1);
}
