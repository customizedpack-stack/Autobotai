/**
 * Phase 2 Modular Robot Builder: hierarchy tree, gizmos, drag-and-drop,
 * reparenting, joints, deletion, undo/redo, saving and schema v1 migration.
 */
import { assert, canvasStats, createProject, createSuite, launch, SHOTS, startServer, waitForSettledView } from './helpers.mjs';

const suite = createSuite('builder');
const step = (name, fn) => suite.step(name, fn);
const server = await startServer(4183);
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
  console.log('\nPhase 2 Modular Robot Builder\n');

  const tree = () => page.getByTestId('objects-panel');
  const row = (name) => page.getByTestId(`tree-row-${name}`);
  const rowIndent = async (name) => Number.parseFloat(await row(name).evaluate((el) => el.style.paddingLeft));
  const selectInTree = async (name) => {
    await page.getByRole('tab', { name: /Objects/ }).click();
    await tree().getByRole('button', { name, exact: true }).click();
    await page.getByTestId('object-inspector').waitFor();
  };
  const value = (id) => page.getByTestId(id).inputValue();
  const parentLabel = () => page.getByTestId('parent-select').evaluate((el) => el.selectedOptions[0]?.textContent?.trim() ?? '');
  const worldText = () => page.getByTestId('world-position').textContent();
  const screen = (name) =>
    page.evaluate((n) => {
      const id = window.__araiIdByName?.(n);
      return id ? window.__araiScreenPosition?.(id) : null;
    }, name);

  await page.goto(BASE);
  await createProject(page, BASE, 'explorer-bot', 'Builder Bot');

  await step('Objects tree shows the robot hierarchy with joint badges', async () => {
    await page.getByRole('tab', { name: /Objects/ }).click();
    await page.getByTestId('tree-root').getByText('9 parts · 3 joints').waitFor();
    assert((await rowIndent('Left Wheel')) > (await rowIndent('Chassis')), 'wheel not nested under chassis');
    assert((await rowIndent('Controller Board')) > (await rowIndent('Top Plate')), 'controller not nested under plate');
    await tree().getByRole('button', { name: 'Select joint Left Wheel Joint' }).waitFor();
    await page.screenshot({ path: `${SHOTS}/p2-01-tree.png` });
  });

  await step('Expand and collapse hierarchy nodes', async () => {
    await tree().getByRole('button', { name: 'Collapse Chassis' }).click();
    assert((await row('Left Wheel').count()) === 0, 'children still visible after collapse');
    await tree().getByRole('button', { name: 'Expand Chassis' }).click();
    await row('Left Wheel').waitFor();
  });

  await step('Selecting in the tree shows the component and its joint in the inspector', async () => {
    await selectInTree('Left Wheel');
    assert((await parentLabel()) === 'Chassis', `parent shows "${await parentLabel()}"`);
    await page.getByTestId('object-joint-link').getByText('Left Wheel Joint').waitFor();
    await page.getByText('Transform (relative to parent)').waitFor();
  });

  let wheelWorldBefore = '';
  await step('Move gizmo drag updates the inspector and moves attached parts (one undo step)', async () => {
    wheelWorldBefore = await worldText();
    await selectInTree('Chassis');
    await page.getByRole('button', { name: 'Front', exact: true }).click();
    await waitForSettledView(page, 'Front view');
    await page.keyboard.press('w');
    await page.waitForTimeout(300);
    const p = await screen('Chassis');
    assert(p, 'no screen position for Chassis');
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 60, p.y, { steps: 6 });
    await page.mouse.move(p.x + 120, p.y, { steps: 6 });
    await page.mouse.up();
    const x = Number(await value('pos-x'));
    assert(x > 0.02, `gizmo did not move the chassis (pos-x ${x})`);
    await page.getByTestId('save-state').getByText('Unsaved changes').waitFor();
    await page.screenshot({ path: `${SHOTS}/p2-02-gizmo-move.png` });
    await selectInTree('Left Wheel');
    assert((await worldText()) !== wheelWorldBefore, 'attached wheel did not follow its parent');
    assert((await value('pos-x')) === '0.06', 'wheel local position changed');
    await page.getByTestId('undo').click();
    await selectInTree('Chassis');
    assert((await value('pos-x')) === '0', `one undo did not restore the drag (pos-x ${await value('pos-x')})`);
  });

  await step('Rotate gizmo (E) changes rotation through the same transform', async () => {
    await page.keyboard.press('e');
    await page.waitForTimeout(200);
    const p = await screen('Chassis');
    await page.mouse.move(p.x + 8, p.y + 8);
    await page.mouse.down();
    await page.mouse.move(p.x + 50, p.y + 30, { steps: 8 });
    await page.mouse.up();
    const rot = await Promise.all(['rot-x', 'rot-y', 'rot-z'].map(value));
    assert(rot.some((r) => Number(r) !== 0), `rotation unchanged (${rot.join(', ')})`);
    await page.getByTestId('undo').click();
    const back = await Promise.all(['rot-x', 'rot-y', 'rot-z'].map(value));
    assert(back.every((r) => Number(r) === 0), `undo did not restore rotation (${back.join(', ')})`);
  });

  await step('Scale gizmo (R) changes scale through the same transform', async () => {
    await page.keyboard.press('r');
    await page.waitForTimeout(200);
    const p = await screen('Chassis');
    // The Y scale handle sits about 20-50 px above the center in the Front view.
    await page.mouse.move(p.x, p.y - 40);
    await page.mouse.down();
    await page.mouse.move(p.x, p.y - 70, { steps: 8 });
    await page.mouse.up();
    const scale = await Promise.all(['scl-x', 'scl-y', 'scl-z'].map(value));
    assert(Number(scale[1]) > 1 && scale[0] === '1' && scale[2] === '1', `unexpected scale (${scale.join(', ')})`);
    await page.getByTestId('undo').click();
    await page.keyboard.press('w');
  });

  await step('Numeric edits update the viewport immediately', async () => {
    const before = (await canvasStats(page)).signature;
    await page.getByTestId('pos-y').fill('0.4');
    await page.getByTestId('pos-y').press('Enter');
    await page.waitForTimeout(400);
    assert((await canvasStats(page)).signature !== before, 'viewport did not change');
    await page.getByTestId('undo').click();
    await page.getByRole('button', { name: 'Perspective', exact: true }).click();
    await waitForSettledView(page, 'Perspective view');
  });

  const canvas = page.locator('[data-testid="viewport"] canvas');
  const box = await canvas.boundingBox();

  await step('Drag a component from the library onto the ground', async () => {
    await page.getByRole('tab', { name: 'Components' }).click();
    await page.getByTestId('component-sensor-lidar').dragTo(page.getByTestId('viewport-dropzone'), {
      targetPosition: { x: box.width * 0.22, y: box.height * 0.8 },
    });
    await page.getByTestId('object-inspector').waitFor();
    assert((await page.getByTestId('inspector-name').inputValue()) === 'Lidar', 'dropped component not selected');
    assert((await parentLabel()) === 'None (top level)', `dropped on ground but parent is "${await parentLabel()}"`);
    const y = Number((await worldText()).split(',')[1]);
    assert(Math.abs(y - 0.02) < 0.005, `lidar not resting on the floor (y ${y})`);
  });

  await step('Drag a component onto a part: preview shows, then it attaches to that part', async () => {
    const p = await screen('Top Plate');
    const source = await page.getByTestId('component-sensor-camera').boundingBox();
    await page.mouse.move(source.x + 20, source.y + 10);
    await page.mouse.down();
    await page.mouse.move(p.x - 40, p.y, { steps: 10 });
    await page.mouse.move(p.x, p.y, { steps: 5 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${SHOTS}/p2-03-drop-preview.png` });
    await page.mouse.up();
    await page.getByTestId('object-inspector').waitFor();
    assert((await page.getByTestId('inspector-name').inputValue()) === 'Camera', 'camera not added');
    assert((await parentLabel()) === 'Top Plate', `camera attached to "${await parentLabel()}"`);
    await page.getByTestId('console-log').getByText('Placed "Camera" on "Top Plate" and attached it.').waitFor();
  });

  await step('Reparent from the inspector keeps the world position', async () => {
    await selectInTree('Lidar');
    const before = await worldText();
    await page.getByTestId('parent-select').selectOption({ label: 'Chassis' });
    assert((await parentLabel()) === 'Chassis', 'parent not changed');
    assert((await worldText()) === before, `world position moved: ${before} -> ${await worldText()}`);
    assert((await rowIndent('Lidar')) > (await rowIndent('Chassis')), 'tree not updated');
  });

  await step('Reparent by dragging in the tree', async () => {
    await row('Lidar').dragTo(row('Top Plate'));
    await selectInTree('Lidar');
    assert((await parentLabel()) === 'Top Plate', `tree drop gave parent "${await parentLabel()}"`);
  });

  await step('Circular parenting is prevented', async () => {
    await selectInTree('Chassis');
    const options = await page.getByTestId('parent-select').evaluate((el) => [...el.options].map((o) => o.textContent.trim()));
    for (const name of ['Chassis', 'Left Wheel', 'Top Plate', 'Lidar']) assert(!options.includes(name), `"${name}" offered as parent of Chassis`);
    await row('Chassis').dragTo(row('Controller Board'));
    await page.getByTestId('console-log').getByText(/Reparent rejected: That would create a loop/).waitFor();
    await selectInTree('Chassis');
    assert((await parentLabel()) === 'None (top level)', 'chassis was reparented');
  });

  await step('Create a joint between two components', async () => {
    await selectInTree('Lidar');
    await page.getByTestId('add-joint').click();
    await page.getByRole('dialog', { name: 'Create joint' }).waitFor();
    const parent = await page.getByTestId('joint-parent').evaluate((el) => el.selectedOptions[0]?.textContent?.trim());
    assert(parent === 'Top Plate', `dialog parent prefilled with "${parent}"`);
    await page.getByTestId('create-joint').click();
    await page.getByTestId('joint-inspector').waitFor();
    assert((await page.getByTestId('joint-name').inputValue()) === 'Top Plate → Lidar', 'unexpected joint name');
    await page.screenshot({ path: `${SHOTS}/p2-04-joint-inspector.png` });
  });

  await step('Joint dialog blocks invalid joints', async () => {
    await selectInTree('Camera');
    await page.getByTestId('add-joint').click();
    await page.getByTestId('joint-parent').selectOption({ label: 'Camera' });
    await page.getByTestId('joint-errors').getByText('A component cannot be its own parent.').waitFor();
    assert(await page.getByTestId('create-joint').isDisabled(), 'create enabled for invalid joint');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  });

  await step('Edit joint type, axis, limits, origin; invalid limits are rejected', async () => {
    await page.getByRole('tab', { name: /Objects/ }).click();
    await tree().getByRole('button', { name: 'Select joint Top Plate → Lidar' }).click();
    await page.getByTestId('joint-axis-x').click();
    assert((await page.getByTestId('joint-axis-x').getAttribute('aria-pressed')) === 'true', 'axis not X');
    await page.getByTestId('joint-lower').fill('-45');
    await page.getByTestId('joint-lower').press('Enter');
    assert((await value('joint-lower')) === '-45', 'lower limit not applied');
    await page.getByTestId('joint-lower').fill('500');
    await page.getByTestId('joint-lower').press('Enter');
    await page.waitForTimeout(100);
    assert((await value('joint-lower')) === '-45', `invalid limit kept (${await value('joint-lower')})`);
    await page.getByTestId('console-log').getByText(/Edit joint rejected/).waitFor();
    await page.getByTestId('jpos-y').fill('0.05');
    await page.getByTestId('jpos-y').press('Enter');
    await page.getByTestId('joint-type-prismatic').click();
    await page.getByRole('heading', { name: 'Limits', exact: true }).waitFor();
    assert((await value('joint-upper')) === '0.1', 'prismatic default limits not applied');
    await page.getByTestId('undo').click();
    assert((await page.getByTestId('joint-type-revolute').getAttribute('aria-pressed')) === 'true', 'undo did not restore type');
  });

  await step('Delete a joint safely, then undo', async () => {
    await page.getByTestId('delete-joint').click();
    await page.getByTestId('project-inspector').waitFor();
    await selectInTree('Lidar');
    await page.getByTestId('add-joint').waitFor();
    await page.getByTestId('undo').click();
    await selectInTree('Lidar');
    await page.getByTestId('object-joint-link').waitFor();
  });

  await step('Deleting a parent moves its children up and removes its joints; undo restores', async () => {
    await selectInTree('Chassis');
    await page.keyboard.press('Delete');
    await page.getByTestId('project-inspector').waitFor();
    assert((await rowIndent('Left Wheel')) === (await rowIndent('Top Plate')), 'children not moved up');
    await page.getByTestId('tree-root').getByText(/· 1 joints/).waitFor();
    await page.getByTestId('model-check').getByText('Valid').waitFor();
    await page.getByTestId('undo').click();
    await page.getByTestId('tree-root').getByText(/· 4 joints/).waitFor();
    assert((await rowIndent('Left Wheel')) > (await rowIndent('Chassis')), 'undo did not restore hierarchy');
  });

  await step('Hierarchy and joints survive save and reload', async () => {
    await page.getByTestId('save').click();
    await page.reload();
    await page.getByTestId('workspace').waitFor();
    await page.getByRole('tab', { name: /Objects/ }).click();
    await page.getByTestId('tree-root').getByText('11 parts · 4 joints').waitFor();
    assert((await rowIndent('Lidar')) > (await rowIndent('Top Plate')), 'Lidar no longer under Top Plate');
    await page.screenshot({ path: `${SHOTS}/p2-05-reloaded.png` });
  });

  await step('Other templates open with valid hierarchies (Arm, Humanoid, Drone)', async () => {
    for (const [template, joints] of [
      ['robotic-arm', 3],
      ['humanoid', 8],
      ['quadcopter', 4],
    ]) {
      await createProject(page, BASE, template, `Tree ${template}`);
      await page.getByRole('tab', { name: /Objects/ }).click();
      await page.getByTestId('tree-root').getByText(new RegExp(`· ${joints} joints`)).waitFor();
      await page.getByTestId('model-check').getByText('Valid').waitFor();
      assert((await canvasStats(page)).distinct > 40, `${template} blank`);
      await page.screenshot({ path: `${SHOTS}/p2-06-${template}.png` });
    }
  });

  await step('A Phase 1 (schema v1) project still opens after the update', async () => {
    const legacy = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await legacy.addInitScript(() => {
      if (localStorage.getItem('arai.projects.v1')) return;
      const project = {
        id: 'prj_legacy01',
        name: 'Phase 1 Legacy Bot',
        category: 'mobile',
        templateId: 'explorer-bot',
        schemaVersion: 1,
        objects: [
          { id: 'obj_a', name: 'Old Chassis', category: 'chassis', geometry: { shape: 'box', size: [0.4, 0.1, 0.26] }, color: '#3B82F6', transform: { position: [0, 0.11, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, visible: true, parentId: null, metadata: { componentId: 'chassis-rect', description: '', createdAt: '2026-11-18T10:00:00.000Z' } },
          { id: 'obj_b', name: 'Old Wheel', category: 'wheel', geometry: { shape: 'cylinder', radius: 0.07, height: 0.035 }, color: '#2F3A4C', transform: { position: [0.5, 0.07, 0.155], rotation: [1.5708, 0, 0], scale: [1, 1, 1] }, visible: true, parentId: null, metadata: { componentId: 'wheel-standard', description: '', createdAt: '2026-11-18T10:00:00.000Z' } },
        ],
        createdAt: '2026-11-18T10:00:00.000Z',
        updatedAt: '2026-11-18T10:05:00.000Z',
        savedAt: '2026-11-18T10:05:00.000Z',
      };
      localStorage.setItem('arai.projects.v1', JSON.stringify({ state: { projects: { [project.id]: project } }, version: 1 }));
    });
    const p = await legacy.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(BASE);
    await p.getByRole('link', { name: 'Open Phase 1 Legacy Bot' }).click();
    await p.getByTestId('workspace').waitFor();
    await p.getByRole('tab', { name: /Objects/ }).click();
    await p.getByTestId('tree-root').getByText('2 parts · 0 joints').waitFor();
    await p.getByTestId('console-log').getByText(/Upgraded 1 project\(s\) from schema v1 to v3/).waitFor();
    await p.getByTestId('objects-panel').getByRole('button', { name: 'Old Wheel', exact: true }).click();
    assert((await p.getByTestId('pos-x').inputValue()) === '0.5', 'legacy transform changed');
    await p.waitForTimeout(800);
    assert((await canvasStats(p)).distinct > 40, 'legacy project rendered blank');
    assert(errors.length === 0, errors.join('\n'));
    await legacy.close();
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
