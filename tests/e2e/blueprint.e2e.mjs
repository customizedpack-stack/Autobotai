/**
 * Phase 9 Robot Blueprint in a real browser: the brief's 22-step workflow on Explorer Bot,
 * plus layout checks at 900 and 600 px. Screenshots: docs/testing/phase-9/.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { assert, createProject, createSuite, launch, startServer } from './helpers.mjs';

const SHOTS = 'docs/testing/phase-9';
mkdirSync(SHOTS, { recursive: true });
const suite = createSuite('blueprint');
const step = (name, fn) => suite.step(name, fn);
const server = await startServer(4199);
const BASE = server.url;
let ok = false;

try {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  suite.watch(page);
  console.log('\nPhase 9 Robot Blueprint\n');

  const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
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
  const partOf = (name) => row(name).locator('[data-testid^="vc-part-"]').textContent();
  const checkStatus = (prefix) => page.locator(`[data-testid^="compat-check-${prefix}"]`).first().getAttribute('data-status');

  await step('Setup: create Explorer Bot and save a Code Studio program', async () => {
    await createProject(page, BASE, 'explorer-bot', 'Blueprint Bot');
    await page.getByTestId('mode-code').click();
    await page.getByTestId('code-studio').waitFor();
    await page.getByTestId('lang-javascript').click();
    await page.getByTestId('js-editor').waitFor();
    await page.getByTestId('program-name').fill('Blueprint Drive Test');
    await page.getByTestId('program-name').press('Enter');
    await page.locator('.cm-content').click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await page.keyboard.insertText('await robot.drive(0.5, 0);\nawait robot.wait(500);\nawait robot.stop();\n');
    await page.getByTestId('save-program').click();
    await page.waitForTimeout(300);
    assert((await page.getByTestId('program-list').textContent()).includes('Blueprint Drive Test'), 'program not saved');
    await page.getByTestId('mode-build').click();
    await page.getByTestId('save').click();
  });

  await step('1. Open Explorer Bot from the dashboard', async () => {
    await page.goto(BASE);
    await page.getByRole('link', { name: 'Open Blueprint Bot' }).click();
    await page.getByTestId('workspace').waitFor();
    assert((await text('status-mode')) === 'Build Mode', 'not in Build Mode');
  });

  await step('2. Open the Robot Blueprint: 8 tabs, overview, live 3D view beside it', async () => {
    await page.getByTestId('mode-blueprint').click();
    await page.getByTestId('blueprint-pane').waitFor({ timeout: 15000 });
    for (const id of ['overview', 'robot', 'parts', 'compatibility', 'wiring', 'bom', 'guide', 'history']) assert(await page.getByTestId(`bp-tab-${id}`).isVisible(), `tab ${id} missing`);
    await page.getByTestId('blueprint-overview').waitFor();
    assert(await page.getByTestId('viewport').isVisible(), 'viewport hidden');
    assert((await text('status-mode')) === 'Robot Blueprint', 'status bar mode');
    assert((await text('ov-parts')).includes('0 / 9'), `overview parts: ${await text('ov-parts')}`);
    for (const id of ['bp-nav-build', 'bp-nav-control', 'bp-nav-code', 'bp-nav-environment', 'bp-nav-camera', 'bp-nav-sensors']) assert(await page.getByTestId(id).isVisible(), `${id} missing`);
    await shot('02-blueprint-overview');
  });

  await step('3. Browse the parts catalog: search, category filter, documentation links, compare', async () => {
    await tab('parts');
    await row('Left Motor').locator('[data-testid^="map-"]').click();
    await page.getByTestId('part-picker').waitFor();
    assert((await page.getByTestId('part-category').inputValue()) === 'motor', 'motor category not preselected');
    assert((await page.locator('[data-testid^="part-pololu-"], [data-testid^="part-generic-"]').count()) === 2, 'motor results');
    await page.getByTestId('part-category').selectOption('driver');
    await page.getByTestId('part-pololu-713').waitFor();
    await page.getByTestId('part-category').selectOption('camera');
    await page.getByTestId('part-results-empty').waitFor();
    await page.getByTestId('part-category').selectOption('motor');
    await page.getByTestId('compare-pololu-1101').check();
    await page.getByTestId('compare-pololu-1581').check();
    await page.getByTestId('compare-table').waitFor();
    const links = await page.getByTestId('part-pololu-1101').locator('a').evaluateAll((as) => as.map((a) => [a.href, a.target, a.rel]));
    assert(links.length >= 2 && links.every(([h, t, r]) => h.startsWith('https://') && t === '_blank' && r.includes('noopener')), `links ${JSON.stringify(links)}`);
    await shot('03-catalog-browse-compare');
  });

  await step('4. Map a DC motor to both motors', async () => {
    await page.getByTestId('pick-pololu-1101').click();
    await row('Left Motor').locator('[data-testid^="vc-part-"]').waitFor();
    await pick('Right Motor', 'pololu-1101');
    assert((await partOf('Left Motor')).includes('100:1 Micro Metal Gearmotor HP 6V'), 'left motor');
    assert((await partOf('Right Motor')).includes('100:1 Micro Metal Gearmotor HP 6V'), 'right motor');
  });

  await step('5. Map two wheels; the 3D vs real diameter difference is shown', async () => {
    await pick('Left Wheel', 'pololu-1429', 'wheel');
    await pick('Right Wheel', 'pololu-1429', 'wheel');
    const diffs = await row('Left Wheel').locator('[data-testid^="diffs-"]').textContent();
    assert(diffs.includes('140 mm') && diffs.includes('70 mm'), `diffs: ${diffs}`);
    await shot('05-motors-and-wheels-mapped');
  });

  await step('6. Map a motor driver (blueprint-only hardware item)', async () => {
    await page.getByTestId('hardware-role').selectOption('driver');
    await page.getByTestId('add-hardware').click();
    await page.getByTestId('part-picker').waitFor();
    await page.getByTestId('pick-pololu-713').click();
    await row('Motor driver').locator('[data-testid^="vc-part-"]').waitFor();
    assert((await partOf('Motor driver')).includes('TB6612FNG'), 'driver');
  });

  await step('7. Map a controller to the Controller Board', async () => {
    await pick('Controller Board', 'espressif-esp32-devkitc-v4', 'esp32');
    assert((await partOf('Controller Board')).includes('ESP32-DevKitC V4'), 'controller');
  });

  await step('8. Map a distance sensor (HC-SR04)', async () => {
    await pick('Distance Sensor', 'generic-hc-sr04', 'hc-sr04');
    assert((await partOf('Distance Sensor')).includes('HC-SR04'), 'sensor');
    await shot('08-all-parts-mapped');
  });

  await step('9. Review compatibility: the 5 V HC-SR04 echo on the 3.3 V ESP32 is incompatible', async () => {
    await tab('compatibility');
    const summary = page.getByTestId('compat-summary');
    assert(Number(await summary.getAttribute('data-incompatible')) >= 1, 'no incompatibility found');
    assert((await checkStatus('sl:')) === 'incompatible', 'sensor level not incompatible');
    const reason = await page.locator('[data-testid^="compat-check-sl:"]').textContent();
    assert(reason.includes('GPIO overvoltage'), reason);
    assert((await checkStatus('mv:')) === 'compatible', 'motor voltage');
    assert((await checkStatus('mc:')) === 'warning', 'motor current should warn (stall above continuous)');
    assert((await checkStatus('wheeld:')) === 'warning', 'wheel diameter');
    await shot('09-compatibility-incompatible');
  });

  await step('10. Fix the incompatibility by replacing the sensor with the VL53L0X', async () => {
    await tab('parts');
    await pick('Distance Sensor', 'pololu-2490', 'vl53l0x');
    await tab('compatibility');
    assert((await checkStatus('sl:')) === 'compatible', 'still incompatible');
    assert((await page.getByTestId('compat-summary').getAttribute('data-incompatible')) === '0', 'incompatibilities left');
    await shot('10-compatibility-fixed');
  });

  await step('11. Generate the BOM: pack quantities, verified prices only, CSV export', async () => {
    await tab('bom');
    await page.getByTestId('bom-generate').click();
    const lines = page.getByTestId('bom-line');
    assert((await lines.count()) === 5, `lines ${await lines.count()}`);
    const wheel = page.locator('[data-testid="bom-line"][data-name="Pololu Wheel 70×8mm Pair - White"]');
    assert((await wheel.getByTestId('bom-qty').textContent()) === '1', 'wheel pair quantity');
    assert((await page.getByTestId('bom-required-total').getAttribute('data-total')) === '', 'total shown although prices are missing');
    assert((await text('bom-notice')).includes('change'), 'price notice');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('bom-csv').click()]);
    const csv = readFileSync(await download.path(), 'utf8');
    assert(csv.includes('"TB6612FNG Dual Motor Driver Carrier"') && csv.includes('"4.95"') && csv.includes('Required total not shown'), 'csv content');
    await shot('11-bom');
  });

  await step('12. Review wiring: standard wires, flagged unspecified pins, drawn only when safe', async () => {
    await tab('wiring');
    await page.getByTestId('wiring-standard').click();
    await page.getByTestId('wiring-message').waitFor();
    assert((await page.locator('[data-testid^="wiring-issue-unspecified"]').count()) > 0, 'unspecified not flagged');
    assert((await page.locator('[data-testid^="wiring-issue-missing-protection"]').count()) === 0, 'no battery yet, protection should not be required');
    const sda = page.locator('tr:has([data-testid^="wire-ppin-"][value="SDA"])');
    await sda.locator('[data-testid^="wire-cpin-"]').fill('GPIO21');
    await sda.locator('[data-testid^="wire-cpin-"]').press('Tab');
    const scl = page.locator('tr:has([data-testid^="wire-ppin-"][value="SCL"])');
    await scl.locator('[data-testid^="wire-cpin-"]').fill('GPIO22');
    await scl.locator('[data-testid^="wire-cpin-"]').press('Tab');
    await page.getByTestId('wiring-diagram').waitFor();
    assert(Number(await page.getByTestId('wiring-diagram').getAttribute('data-wires')) >= 4, 'diagram wires');
    assert((await page.locator('[data-ok="true"]').count()) >= 4, 'ok rows');
    await shot('12-wiring');
  });

  await step('13. Generate the Build Guide with 14 sections', async () => {
    await tab('guide');
    await page.getByTestId('guide-generate').click();
    await page.getByTestId('guide-tab').waitFor();
    assert((await page.locator('[data-testid^="guide-section-"]').count()) === 14, 'sections');
    assert((await page.locator('[data-testid^="guide-step-"][data-status="completed"]').count()) === 0, 'steps completed automatically');
    await shot('13-build-guide');
  });

  await step('14. Mark a step in progress', async () => {
    const first = page.locator('[data-testid^="guide-step-motors:"]').first();
    await first.locator('select').selectOption('in-progress');
    assert((await first.getAttribute('data-status')) === 'in-progress', 'status');
    assert((await text('guide-progress')).includes('1 in progress'), 'progress');
  });

  await step('15. Add a note to the step', async () => {
    const first = page.locator('[data-testid^="guide-step-motors:"]').first();
    await first.locator('textarea').fill('Left motor turns backwards: swap its wires.');
    await first.locator('textarea').press('Tab');
    await page.waitForTimeout(200);
    assert((await first.locator('textarea').inputValue()).includes('swap its wires'), 'note');
    await shot('15-step-in-progress-with-note');
  });

  await step('16. Change a mapping (ESP32 → Arduino UNO R3)', async () => {
    await tab('parts');
    await pick('Controller Board', 'arduino-uno-r3', 'uno');
    assert((await partOf('Controller Board')).includes('Arduino UNO R3'), 'controller not replaced');
  });

  await step('17. Build History records the change', async () => {
    await tab('history');
    const replaced = page.locator('[data-testid="history-event"][data-type="part.replaced"]').first();
    const t = await replaced.textContent();
    assert(t.includes('Controller Board') && t.includes('ESP32-DevKitC V4') && t.includes('Arduino UNO R3'), t);
    assert((await page.locator('[data-testid="history-event"][data-type="bom.generated"]').count()) === 1, 'bom event');
    assert((await page.locator('[data-testid="history-event"][data-type="guide.generated"]').count()) === 1, 'guide event');
    await page.getByTestId('snapshot-label').fill('Before reload');
    await page.getByTestId('snapshot-create').click();
    await page.getByTestId('snapshot').waitFor();
    await shot('17-build-history');
  });

  await step('18. Save and reload the browser', async () => {
    assert((await page.getByTestId('save-state').textContent()).includes('Unsaved'), 'not marked unsaved');
    await page.getByTestId('save').click();
    await page.getByTestId('save-state').getByText(/Saved/).waitFor();
    await page.reload();
    await page.getByTestId('workspace').waitFor();
    await page.waitForTimeout(800);
  });

  await step('19. Everything is preserved after reload', async () => {
    await page.getByTestId('mode-blueprint').click();
    await page.getByTestId('blueprint-pane').waitFor({ timeout: 15000 });
    await tab('parts');
    assert((await page.locator('[data-mapped="true"]').count()) === 7, `mapped ${await page.locator('[data-mapped="true"]').count()}`);
    assert((await partOf('Controller Board')).includes('Arduino UNO R3'), 'controller mapping lost');
    assert((await partOf('Distance Sensor')).includes('VL53L0X'), 'sensor mapping lost');
    await tab('wiring');
    const sda = page.locator('tr:has([data-testid^="wire-ppin-"][value="SDA"])');
    assert((await sda.locator('[data-testid^="wire-cpin-"]').inputValue()) === 'GPIO21', 'wire pin lost');
    await tab('guide');
    const first = page.locator('[data-testid^="guide-step-motors:"]').first();
    assert((await first.getAttribute('data-status')) === 'in-progress', 'step status lost');
    assert((await first.locator('textarea').inputValue()).includes('swap its wires'), 'note lost');
    await tab('history');
    assert((await page.locator('[data-testid="history-event"][data-type="part.replaced"]').count()) >= 2, 'history lost');
    assert((await page.getByTestId('snapshot').count()) === 1, 'version lost');
    await tab('bom');
    assert((await page.getByTestId('bom-line').count()) === 5, 'bom lost');
    await shot('19-preserved-after-reload');
  });

  await step('20. Control Mode still drives the robot', async () => {
    await page.getByTestId('bp-nav-control').click();
    assert((await text('status-mode')) === 'Control Mode', 'not in control mode');
    const expand = page.getByRole('button', { name: 'Expand properties panel' });
    if (await expand.isVisible().catch(() => false)) await expand.click();
    await page.getByTestId('telemetry-position').waitFor();
    const before = await text('telemetry-position');
    await page.getByTestId('status-bar').click();
    await page.keyboard.down('w');
    await page.waitForTimeout(900);
    await page.keyboard.up('w');
    await page.waitForTimeout(300);
    const after = await text('telemetry-position');
    assert(before !== after, `robot did not move (${before} → ${after})`);
    assert((await page.getByTestId('command-error').count()) === 0, 'drive error shown');
    await shot('20-control-mode-drives');
  });

  await step('21. Code Studio programs are intact', async () => {
    await page.getByTestId('mode-code').click();
    await page.getByTestId('code-studio').waitFor();
    assert((await page.getByTestId('program-list').textContent()).includes('Blueprint Drive Test'), 'program missing');
    assert(await page.getByTestId('drive-ready').isVisible(), 'drive not ready in Code Studio');
    await shot('21-code-studio-programs');
  });

  await step('22. The Camera Monitor still works (add a camera, live frames)', async () => {
    await page.getByTestId('mode-build').click();
    await page.getByRole('tab', { name: /^Camera/ }).click();
    await page.getByTestId('camera-add').click();
    await page.getByTestId('mode-blueprint').click();
    await page.getByTestId('bp-nav-camera').click();
    assert((await text('status-mode')) === 'Control Mode', 'camera nav mode');
    await page.getByTestId('camera-monitor').waitFor();
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="camera-feed"]')?.dataset.frames ?? 0) >= 3, null, { timeout: 15000 });
    assert((await text('camera-status')) === 'live', 'camera not live');
    await shot('22-camera-monitor');
  });

  await step('Layout: the Blueprint at 900 px and 600 px', async () => {
    await page.getByTestId('mode-blueprint').click();
    await page.getByTestId('blueprint-pane').waitFor();
    for (const width of [900, 600]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(300);
      await tab('parts');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert(overflow <= 1, `horizontal page overflow at ${width}px: ${overflow}`);
      assert(await page.getByTestId('bp-tab-history').isVisible(), `tabs not reachable at ${width}px`);
      await shot(`layout-${width}-parts`);
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
