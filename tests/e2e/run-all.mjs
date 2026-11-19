/** Runs every end-to-end suite in sequence. Needs `npm run build` first. */
import { spawnSync } from 'node:child_process';

const suites = ['workspace.e2e.mjs', 'corrections.e2e.mjs', 'builder.e2e.mjs', 'control.e2e.mjs', 'code-studio.e2e.mjs', 'physics.e2e.mjs', 'sensors.e2e.mjs'];
let failed = 0;
for (const suite of suites) {
  const result = spawnSync(process.execPath, [`tests/e2e/${suite}`], { stdio: 'inherit' });
  if (result.status !== 0) failed += 1;
}
console.log(failed === 0 ? `All ${suites.length} end-to-end suites passed.` : `${failed} of ${suites.length} end-to-end suites failed.`);
process.exit(failed === 0 ? 0 : 1);
