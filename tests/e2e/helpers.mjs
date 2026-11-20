/** Shared helpers for the end-to-end suites (headless Chrome via Playwright). */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

export const SHOTS = 'tests/e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export async function startServer(port) {
  // Own process group, so stop() ends the Vite server itself and not only the npx wrapper.
  const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore', detached: true });
  const stop = () => {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      server.kill();
    }
  };
  const url = `http://localhost:${port}`;
  const start = Date.now();
  while (Date.now() - start < 20000) {
    try {
      if ((await fetch(url)).ok) return { url, stop };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  stop();
  throw new Error('Preview server did not start');
}

export async function launch() {
  const executablePath = process.env.CHROME_PATH ?? (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
  return chromium.launch({
    executablePath,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
}

/** A suite runner that records pass/fail per step, screenshots failures and collects console errors. */
export function createSuite(title) {
  const results = [];
  const consoleErrors = [];
  let currentPage = null;
  return {
    title,
    results,
    consoleErrors,
    watch(page) {
      currentPage = page;
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
    },
    async step(name, fn) {
      try {
        await fn();
        results.push({ name, ok: true });
        console.log(`  PASS  ${name}`);
      } catch (error) {
        results.push({ name, ok: false, error: String(error?.message ?? error) });
        console.log(`  FAIL  ${name}\n        ${process.env.E2E_VERBOSE ? String(error?.message ?? error) : String(error?.message ?? error).split('\n')[0]}`);
        if (currentPage) await currentPage.screenshot({ path: `${SHOTS}/fail-${title}-${results.length}.png` }).catch(() => {});
      }
    },
    summary() {
      const failed = results.filter((r) => !r.ok);
      console.log(`\n${title}: ${results.length - failed.length}/${results.length} steps passed\n`);
      return failed.length === 0;
    },
  };
}

/** Rough check that the WebGL canvas drew a real scene (not a blank color). */
export async function canvasStats(page) {
  return page.evaluate(() => {
    const src = document.querySelector('[data-testid="viewport"] canvas');
    if (!src) return { found: false, distinct: 0, width: 0 };
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 64;
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const colors = new Set();
    for (let i = 0; i < data.length; i += 4) colors.add(`${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`);
    return { found: true, distinct: colors.size, width: src.width, signature: c.toDataURL().slice(-200) };
  });
}

/** Create a project from a template through the real UI and wait for the workspace. */
export async function createProject(page, base, templateId, name) {
  await page.goto(`${base}/new?template=${templateId}`);
  await page.getByLabel('Robot name').fill(name);
  await page.getByRole('button', { name: 'Create Workspace' }).click();
  await page.getByTestId('workspace').waitFor();
  await page.waitForTimeout(1200);
}

/** Screen position of a component's origin (needs window.__ARAI_E2E__ set before load). */
export async function screenPosition(page, componentName) {
  return page.evaluate((name) => {
    const w = window;
    const id = w.__araiIdByName?.(name);
    return id ? w.__araiScreenPosition?.(id) ?? null : null;
  }, componentName);
}

export async function waitForSettledView(page, label) {
  await page.getByTestId('active-view').getByText(label).waitFor({ timeout: 5000 });
}
