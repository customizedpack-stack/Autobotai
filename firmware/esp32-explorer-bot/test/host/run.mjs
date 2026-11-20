/** Compiles and runs the firmware core host tests with the system C++ compiler (g++ or c++). */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = 'firmware/esp32-explorer-bot';
const out = join(tmpdir(), 'autobotai-fw-host-tests');
mkdirSync(tmpdir(), { recursive: true });
const cxx = process.env.CXX ?? 'g++';
const build = spawnSync(cxx, ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-o', out, `${root}/test/host/test_core.cpp`, `${root}/lib/robot_core/robot_core.cpp`], { stdio: 'inherit' });
if (build.status !== 0) {
  console.error(`Firmware host tests could not be built with ${cxx}.`);
  process.exit(build.status ?? 1);
}
const run = spawnSync(out, [`${root}/test/vectors/protocol-v1.txt`], { stdio: 'inherit' });
process.exit(run.status ?? 1);
