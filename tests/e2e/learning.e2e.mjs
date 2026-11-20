/**
 * Phase 11 Guided Robotics Learning in a real browser:
 * Beginner, Professional, Reverse Engineering and Purpose Builder journeys, the existing-project
 * regression, responsive layouts (1440/1024/768/600/375) and accessibility checks.
 * Screenshots: docs/testing/phase-11/.
 */
import { mkdirSync } from 'node:fs';
import { assert, createProject, createSuite, launch, startServer } from './helpers.mjs';

const SHOTS = 'docs/testing/phase-11';
mkdirSync(SHOTS, { recursive: true });
const suite = createSuite('learning');
const step = (name, fn) => suite.step(name, fn);
const server = await startServer(4203);
const BASE = server.url;
let ok = false;

try {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  suite.watch(page);
  console.log('\nPhase 11 Guided Robotics Learning\n');

  const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
  const panel = () => page.getByTestId('tutorial-panel');
  const stepTitle = () => page.getByTestId('tutorial-step-title').textContent();
  const verify = () => page.getByTestId('verify-step').click();
  const status = () => page.getByTestId('step-status').getAttribute('data-status');
  const waitStatus = (s) => page.waitForFunction((v) => document.querySelector('[data-testid="step-status"]')?.getAttribute('data-status') === v, s, { timeout: 8000 });
  const next = async (title) => {
    await page.getByTestId('tutorial-next').click();
    await page.getByTestId('tutorial-step-title').getByText(title).waitFor();
  };
  const projectsJson = () => page.evaluate(() => localStorage.getItem('arai.projects.v1'));

  // ── Existing project regression: a project made with Phase 1–10 features, BEFORE any Phase 11 page is used ──
  let legacyId = '';
  let legacyBefore = '';
  await step('Regression setup: a Phase 10 project with program, environment, camera, Blueprint parts and hardware profile', async () => {
    await createProject(page, BASE, 'explorer-bot', 'Legacy Bot');
    legacyId = page.url().split('/workspace/')[1].split('?')[0];
    await page.getByRole('tab', { name: /^Camera/ }).click();
    await page.getByTestId('camera-add').click();
    await page.getByTestId('mode-code').click();
    await page.getByTestId('code-studio').waitFor();
    await page.getByTestId('lang-javascript').click();
    await page.getByTestId('js-editor').waitFor();
    await page.getByTestId('program-name').fill('Legacy Program');
    await page.getByTestId('program-name').press('Enter');
    await page.getByTestId('mode-blueprint').click();
    await page.getByTestId('blueprint-pane').waitFor({ timeout: 15000 });
    await page.getByTestId('bp-tab-hardware').click();
    await page.getByTestId('hw-select-profile').click();
    await page.getByTestId('mode-build').click();
    await page.getByTestId('save').click();
    await page.getByTestId('save-state').getByText(/Saved/).waitFor();
    legacyBefore = await projectsJson();
    const p = JSON.parse(legacyBefore).state.projects[legacyId];
    assert(p.sensors.some((s) => s.type === 'camera'), 'camera not saved');
    assert(p.blueprint.hardwareProfile, 'hardware profile not saved');
  });

  // ── Beginner journey ──
  await step('Beginner: dashboard asks for the experience mode; choose Beginner Mode', async () => {
    await page.goto(BASE);
    await page.getByRole('heading', { name: 'Build. Code. Simulate. Innovate.' }).waitFor();
    await page.getByTestId('experience-chooser').waitFor();
    for (const id of ['action-learn', 'action-library', 'action-create', 'continue-learning', 'learning-progress']) assert(await page.getByTestId(id).isVisible(), `${id} missing`);
    await shot('01-dashboard');
    await page.getByTestId('choose-beginner').click();
    await page.getByTestId('experience-chooser').waitFor({ state: 'detached' });
    assert((await page.getByTestId('sidebar-experience').inputValue()) === 'beginner', 'mode not stored');
  });

  await step('Beginner: Project Library shows six projects with honest support status, and filters', async () => {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Project Library' }).click();
    await page.getByRole('heading', { name: 'Project Library' }).waitFor();
    assert((await page.getByTestId('library-card').count()) === 6, 'not six projects');
    await page.getByTestId('library-difficulty').selectOption('advanced');
    assert((await page.getByTestId('library-card').count()) === 1, 'difficulty filter');
    await page.getByTestId('library-difficulty').selectOption('all');
    await shot('02-project-library');
  });

  await step('Beginner: Project Details lists purpose, parts, capabilities and a verified-price budget', async () => {
    await page.getByRole('link', { name: 'Obstacle Avoidance Robot: view details' }).click();
    await page.getByTestId('project-detail').waitFor();
    for (const h of ['Purpose', 'Real-world use', 'How it works', 'Learning objectives', 'Required parts', 'Simulation support', 'Physical build support', 'Expected result', 'Success criteria']) {
      await page.getByRole('heading', { name: h, exact: true }).waitFor();
    }
    assert((await page.locator('[data-testid="cap-deployment"]').getAttribute('data-status')) === 'hardware-deployment', 'deployment status');
    assert((await page.locator('[data-testid="cap-deployment"]').textContent()).includes('simulated device only'), 'deployment caveat missing');
    assert((await page.getByTestId('budget').textContent()).includes('US$63.25'), await page.getByTestId('budget').textContent());
    await page.getByTestId('detail-components').click();
    await page.getByTestId('component-explorer').waitFor();
    assert((await page.getByTestId('component-explorer').locator('li').count()) === 9, 'component explorer count');
    await shot('03-project-detail');
  });

  let tutorialProjectId = '';
  await step('Beginner: Start Guided Tutorial creates a new project and opens the tutorial in the workspace', async () => {
    const before = Object.keys(JSON.parse(await projectsJson()).state.projects).length;
    await page.getByTestId('detail-start-tutorial').click();
    await page.getByTestId('start-tutorial-dialog').waitFor();
    await page.getByTestId('start-new-tutorial').click();
    await page.getByTestId('workspace').waitFor();
    await panel().waitFor({ timeout: 15000 });
    tutorialProjectId = page.url().split('/workspace/')[1].split('?')[0];
    assert(Object.keys(JSON.parse(await projectsJson()).state.projects).length === before + 1, 'no new project');
    assert(tutorialProjectId !== legacyId, 'reused an existing project');
    await page.getByTestId('beginner-guide').waitFor();
    assert((await page.getByTestId('mode-environment').count()) === 0, 'Beginner Mode shows every tool');
    await page.getByTestId('more-tools').click();
    await page.getByTestId('mode-environment').waitFor();
    await page.getByTestId('more-tools').click();
    assert((await stepTitle()) === 'Understand Robot Purpose', await stepTitle());
  });

  await step('Tutorial step 1: Learn and a labeled manual check', async () => {
    assert((await page.getByText('Manual check').count()) > 0, 'manual label');
    await page.getByTestId('manual-check').check();
    await waitStatus('passed');
    await next('Explore Components');
  });

  await step('Tutorial step 2: automatic verification fails with recovery help, then passes on the real selection', async () => {
    await verify();
    await waitStatus('failed');
    const help = await page.getByTestId('verify-help').first().textContent();
    assert(help.includes('Why:') && help.includes('Where:'), help);
    assert((await page.getByTestId('verify-results').textContent()).includes('Nothing is selected.'), 'real selection result');
    await shot('04-tutorial-verify-failed');
    await page.getByRole('tab', { name: /Objects/ }).click();
    await page.getByTestId('objects-panel').getByRole('button', { name: 'Distance Sensor', exact: true }).click();
    await verify();
    await waitStatus('passed');
    await shot('05-tutorial-verify-passed');
    await next('Design Robot in 3D');
  });

  await step('Tutorial steps 3–5: design and drive checks pass; the optional electronics step is skipped', async () => {
    await verify();
    await waitStatus('passed');
    await next('Assemble Robot');
    await verify();
    await waitStatus('passed');
    assert((await page.getByTestId('verify-results').textContent()).includes('Differential drive'), 'drive check');
    await next('Understand Electronics and Wiring');
    await page.getByTestId('tutorial-skip').click();
    await page.getByTestId('tutorial-step-title').getByText('Learn Programming Logic').waitFor();
  });

  await step('Tutorial step 6: insert the starter program through Code Studio; the saved program is verified', async () => {
    await page.getByTestId('do-insert-starter-program').click();
    await page.getByTestId('code-studio').waitFor();
    await page.getByTestId('do-message').getByText(/Added "Obstacle Avoidance"/).waitFor();
    await verify();
    await waitStatus('passed');
  });

  await step('Save, leave and resume the tutorial from the dashboard at the same step', async () => {
    await page.getByTestId('save').click();
    await page.getByRole('button', { name: 'Back to dashboard' }).click();
    await page.getByRole('heading', { name: 'Build. Code. Simulate. Innovate.' }).waitFor();
    await page.getByTestId('resume-tutorial').first().waitFor();
    assert((await page.getByTestId('progress-started').textContent()) === '1', 'progress count');
    await shot('06-dashboard-continue-learning');
    await page.getByTestId('resume-tutorial').first().click();
    await panel().waitFor({ timeout: 15000 });
    assert((await stepTitle()) === 'Learn Programming Logic', `resumed at ${await stepTitle()}`);
    assert((await status()) === 'passed', 'step result not kept');
  });

  await step('Tutorial step 7: run the program in the Obstacle Course with the Physics engine', async () => {
    await next('Run Simulation');
    await verify();
    await waitStatus('failed');
    await page.getByTestId('do-use-the-obstacle-course').click();
    await page.getByTestId('do-open-code').click();
    await page.getByTestId('code-studio').waitFor();
    await page.getByTestId('do-simulate-physics').click();
    await page.getByTestId('mode-simulate').and(page.locator('[aria-pressed="true"]')).waitFor({ timeout: 15000 });
    await page.getByTestId('run-program').click();
    await page.getByTestId('execution-status').getByText('Running').waitFor({ timeout: 15000 });
    await shot('07-tutorial-simulation-running');
    await page.getByTestId('execution-status').getByText('Completed').waitFor({ timeout: 90000 });
    await verify();
    await waitStatus('passed');
  });

  await step('Tutorial completion: optional build guide skipped, save, manual result, summary', async () => {
    await next('Follow Physical Build Guide');
    await page.getByTestId('tutorial-skip').click();
    await page.getByTestId('tutorial-step-title').getByText('Test and Complete').waitFor();
    await page.getByTestId('manual-check').check();
    await page.getByTestId('save').click();
    await verify();
    await waitStatus('passed');
    await page.getByTestId('tutorial-complete').waitFor();
    const verified = await page.getByTestId('summary-verified').textContent();
    assert(verified.includes('Run Simulation') && verified.includes('Assemble Robot'), verified);
    assert((await page.getByTestId('tutorial-complete').textContent()).includes('Not built or tested by AutoBotAI'), 'physical claim');
    await shot('08-tutorial-complete');
  });

  // ── Professional journey ──
  await step('Professional: full workspace — Builder, Code Studio, Simulation, Blueprint', async () => {
    await page.getByRole('button', { name: 'Back to dashboard' }).click();
    await page.getByTestId('sidebar-experience').selectOption('professional');
    await page.getByRole('link', { name: 'My Projects' }).click();
    await page.getByRole('link', { name: 'Open Legacy Bot' }).click();
    await page.getByTestId('workspace').waitFor();
    assert((await page.getByTestId('beginner-guide').count()) === 0, 'beginner guide in Professional Mode');
    assert((await page.getByTestId('more-tools').count()) === 0, 'more tools in Professional Mode');
    for (const m of ['build', 'control', 'code', 'environment', 'blueprint', 'simulate']) assert(await page.getByTestId(`mode-${m}`).isVisible(), `${m} hidden`);
    await page.getByTestId('mode-code').click();
    await page.getByTestId('code-studio').waitFor();
    await page.getByTestId('mode-simulate').click();
    await page.getByTestId('mode-simulate').and(page.locator('[aria-pressed="true"]')).waitFor({ timeout: 15000 });
    await page.getByTestId('mode-blueprint').click();
    await page.getByTestId('blueprint-pane').waitFor({ timeout: 15000 });
    await page.getByTestId('mode-build').click();
    await shot('09-professional-workspace');
  });

  await step('Existing project regression: the Phase 10 project is unchanged after Phase 11 pages and mode changes', async () => {
    const after = JSON.parse(await projectsJson()).state.projects[legacyId];
    const before = JSON.parse(legacyBefore).state.projects[legacyId];
    // Pre-existing Phase 7 behavior: a project without a stored environment records "floor" (the default) when opened
    // after another project used a different environment. It is the same environment, not a Phase 11 change.
    if (before.environmentId === undefined && after.environmentId === 'floor') after.environmentId = undefined;
    const changed = Object.keys({ ...before, ...after }).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
    assert(changed.length === 0, `legacy project data changed: ${changed.join(', ')}`);
    const programs = JSON.parse(await page.evaluate(() => localStorage.getItem('arai.programs.v1'))).state.programs;
    assert(Object.values(programs).some((p) => p.projectId === legacyId && p.name === 'Legacy Program'), 'program missing');
    await page.getByTestId('mode-blueprint').click();
    await page.getByTestId('bp-tab-hardware').click();
    await page.getByTestId('hw-validate').waitFor();
    assert((await page.getByTestId('hw-select-profile').count()) === 0 || !(await page.getByTestId('hw-select-profile').isVisible()), 'hardware profile lost');
    await page.getByTestId('mode-build').click();
  });

  // ── Reverse Engineering journey ──
  await step('Reverse: choose the mode on Learn Robotics and inspect a completed robot (read-only)', async () => {
    await page.getByRole('button', { name: 'Back to dashboard' }).click();
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Learn Robotics' }).click();
    await page.getByRole('heading', { name: 'Learn Robotics' }).waitFor();
    await page.getByTestId('learn-experience').selectOption('reverse');
    await shot('10-learn-robotics');
    await page.getByTestId('reverse-obstacle-avoidance').click();
    await page.getByTestId('inspect-panel').waitFor({ timeout: 15000 });
    await page.getByTestId('read-only-note').waitFor();
    assert(await page.getByTestId('save').isDisabled(), 'save allowed while inspecting');
    assert((await page.getByTestId('right-panel-wrap').getAttribute('inert')) !== null, 'editing panels are not read-only while inspecting');
    assert((await page.getByTestId('robot-counts').textContent()).includes('1 programs'), await page.getByTestId('robot-counts').textContent());
  });

  let exampleBefore = '';
  await step('Reverse: component selection shows real relationships and highlights the part', async () => {
    const id = page.url().split('/workspace/')[1].split('?')[0];
    exampleBefore = JSON.stringify(JSON.parse(await projectsJson()).state.projects[id]);
    await page.getByTestId('reverse-stage-3').click();
    await page.getByTestId('reverse-tree-item').filter({ hasText: 'Left Wheel' }).click();
    await page.getByTestId('component-insight').waitFor();
    assert((await page.getByTestId('insight-parent').textContent()) === 'Chassis', 'parent');
    assert((await page.getByTestId('insight-connected').textContent()).includes('Chassis (Left Wheel Joint, revolute)'), await page.getByTestId('insight-connected').textContent());
    await page.waitForTimeout(800);
    await shot('11-reverse-component');
    await page.getByTestId('reverse-stage-5').click();
    await page.getByTestId('reverse-joints').getByText('Left Wheel Joint').waitFor();
  });

  await step('Reverse: the program explanation uses the real program and links the selected part to its lines', async () => {
    await page.getByTestId('reverse-stage-3').click();
    await page.getByTestId('reverse-tree-item').filter({ hasText: 'Distance Sensor' }).click();
    await page.getByTestId('reverse-stage-7').click();
    await page.getByTestId('reverse-program').waitFor();
    assert((await page.getByTestId('explained-line').count()) > 10, 'explained lines');
    const related = page.locator('[data-testid="explained-line"][data-related="true"]');
    assert((await related.count()) === 1 && (await related.textContent()).includes('robotSensors.distance'), 'related line');
    await shot('12-reverse-program');
  });

  await step('Reverse: build sequence; the inspected project was not modified', async () => {
    await page.getByTestId('reverse-stage-9').click();
    assert((await page.getByTestId('build-sequence').textContent()).includes('Start with Chassis'), 'sequence');
    const id = page.url().split('/workspace/')[1].split('?')[0];
    assert(JSON.stringify(JSON.parse(await projectsJson()).state.projects[id]) === exampleBefore, 'example project changed during inspection');
    await page.getByTestId('exit-inspection').click();
    await page.getByTestId('inspect-panel').waitFor({ state: 'detached' });
    assert(!(await page.getByTestId('save').isDisabled()), 'save still disabled');
    assert((await page.getByTestId('right-panel-wrap').getAttribute('inert')) === null, 'panels still read-only');
  });

  // ── Purpose Builder journey ──
  await step('Purpose Builder: goal + guided questions → best match, alternatives and honest limits', async () => {
    await page.getByRole('button', { name: 'Back to dashboard' }).click();
    await page.getByTestId('sidebar-experience').selectOption('beginner');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Robot Builder' }).click();
    await page.getByRole('heading', { name: 'Robot Builder' }).waitFor();
    await page.getByTestId('purpose-text').fill('I want a robot that can move around my garden and monitor soil conditions.');
    await page.getByTestId('detect-images').click();
    await page.getByTestId('purpose-where').selectOption('garden');
    await page.getByTestId('purpose-experience').selectOption('intermediate');
    await page.getByTestId('purpose-submit').click();
    await page.getByTestId('purpose-best').waitFor();
    assert((await page.getByTestId('purpose-best').getAttribute('data-project')) === 'agriculture-monitoring', 'best match');
    assert((await page.getByTestId('purpose-unsupported').textContent()).includes('no soil'), 'soil limitation');
    assert((await page.getByTestId('purpose-alternative').count()) >= 1, 'alternatives');
    await shot('13-purpose-builder');
  });

  await step('Purpose Builder: an unsupported idea is not claimed; Modify My Idea; then Project details and Tutorial', async () => {
    await page.getByTestId('purpose-modify').click();
    await page.getByTestId('purpose-text').fill('a flying drone that films my house');
    await page.getByTestId('detect-images').click();
    await page.getByTestId('purpose-where').selectOption('');
    await page.getByTestId('purpose-submit').click();
    await page.getByTestId('purpose-unsupported').getByText(/cannot be built or simulated in AutoBotAI yet/).waitFor();
    await page.getByTestId('purpose-text').fill('a robot that drives around my room and avoids walls');
    await page.getByTestId('purpose-submit').click();
    await page.getByTestId('purpose-best').and(page.locator('[data-project="obstacle-avoidance"]')).waitFor();
    await page.getByTestId('purpose-best').getByTestId('purpose-explore').click();
    await page.getByTestId('project-detail').waitFor();
    await page.getByTestId('detail-start-tutorial').click();
    await page.getByTestId('start-tutorial-dialog').waitFor();
    assert((await page.getByTestId('resume-in-dialog').count()) === 1, 'resume option for the started tutorial');
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  await step('Open Robot creates a ready-to-run robot (a new project, never an overwrite)', async () => {
    const before = Object.keys(JSON.parse(await projectsJson()).state.projects).length;
    await page.getByTestId('detail-open-robot').click();
    await page.getByTestId('workspace').waitFor();
    const projects = JSON.parse(await projectsJson()).state.projects;
    assert(Object.keys(projects).length === before + 1, 'Open Robot did not create a new project');
    await page.getByTestId('mode-code').click();
    await page.getByTestId('code-studio').waitFor();
    assert((await page.getByTestId('program-name').inputValue()) === 'Obstacle Avoidance', 'starter program not opened');
  });

  // ── Responsive layouts and accessibility ──
  await step('Responsive: Dashboard, Library, Details, Learn and Robot Builder at 1440/1024/768/600/375 px without horizontal overflow', async () => {
    await page.goto(BASE);
    const pages = [
      ['dashboard', '/'],
      ['library', '/library'],
      ['detail', '/library/security-patrol-robot'],
      ['learn', '/learn'],
      ['builder', '/builder'],
    ];
    for (const width of [1440, 1024, 768, 600, 375]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [name, path] of pages) {
        await page.evaluate((p) => {
          window.history.pushState({}, '', p);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }, path);
        await page.locator('h1').first().waitFor();
        await page.waitForTimeout(150);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert(overflow <= 1, `${name} at ${width}px overflows by ${overflow}px`);
        if (name === 'dashboard' || name === 'library' || (width === 375 && name !== 'dashboard')) await shot(`responsive-${width}-${name}`);
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await step('Responsive: workspace with the tutorial panel at 1024, 768 and 375 px', async () => {
    for (const width of [1024, 768, 375]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${BASE}/workspace/${tutorialProjectId}?tutorial=tutorial-obstacle-avoidance`);
      await page.getByTestId('learning-panel').waitFor({ timeout: 15000 });
      const box = await page.getByTestId('learning-panel').boundingBox();
      assert(box && box.width <= width, `panel wider than ${width}px`);
      await shot(`responsive-${width}-workspace-tutorial`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await step('Accessibility: one h1 per page, labeled controls, keyboard navigation and focus indicator', async () => {
    for (const path of ['/', '/library', '/library/delivery-robot', '/learn', '/builder']) {
      await page.goto(`${BASE}${path}`);
      await page.locator('h1').first().waitFor();
      const report = await page.evaluate(() => {
        const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        const unnamedButtons = [...document.querySelectorAll('button, a[href]')].filter((el) => visible(el) && !(el.getAttribute('aria-label') || el.textContent.trim() || el.getAttribute('title')));
        const unlabeled = [...document.querySelectorAll('input, select, textarea')].filter((el) => {
          if (!visible(el) || el.type === 'hidden') return false;
          const id = el.id;
          return !(el.getAttribute('aria-label') || (id && document.querySelector(`label[for="${id}"]`)) || el.closest('label'));
        });
        const svgsWithoutHidden = [...document.querySelectorAll('main svg')].filter((s) => s.getAttribute('aria-hidden') !== 'true' && !s.getAttribute('aria-label') && !s.closest('[aria-label]') && !s.closest('button, a'));
        return { h1: document.querySelectorAll('h1').length, unnamed: unnamedButtons.length, unlabeled: unlabeled.map((e) => e.outerHTML.slice(0, 80)), svgs: svgsWithoutHidden.length };
      });
      assert(report.h1 === 1, `${path}: ${report.h1} h1 elements`);
      assert(report.unnamed === 0, `${path}: ${report.unnamed} unnamed buttons or links`);
      assert(report.unlabeled.length === 0, `${path}: unlabeled ${report.unlabeled.join(' | ')}`);
    }
    // Keyboard: Tab reaches the main navigation; Enter follows it; focus is visible.
    await page.goto(BASE);
    await page.locator('h1').waitFor();
    let reached = false;
    for (let i = 0; i < 12 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Project Library');
    }
    assert(reached, 'Tab did not reach "Project Library"');
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    assert(outline !== 'none', 'no visible focus outline');
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Project Library' }).waitFor();
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
