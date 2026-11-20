import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DeviceCore, type CoreDistStatus, type ResetReason } from '../device/deviceCore';
import { parseDeviceLine } from '../protocol/protocol';

/**
 * Runs the shared protocol conformance vectors against the TypeScript device core
 * (the simulated device). The firmware core runs the same file (npm run test:firmware).
 * Every device line produced here must also pass the browser's strict parser.
 */

const VECTORS = 'firmware/esp32-explorer-bot/test/vectors/protocol-v1.txt';

interface Case {
  name: string;
  lines: { no: number; text: string }[];
}

function loadCases(): Case[] {
  const cases: Case[] = [];
  readFileSync(VECTORS, 'utf8')
    .split('\n')
    .forEach((text: string, i: number) => {
      if (!text || text.startsWith('#')) return;
      if (text.startsWith('=== ')) cases.push({ name: text.slice(4), lines: [] });
      else cases.at(-1)?.lines.push({ no: i + 1, text });
    });
  return cases;
}

function run(c: Case): string[] {
  const failures: string[] = [];
  const queue: string[] = [];
  let lastTel = '';
  let session = '';
  const core = new DeviceCore((line) => {
    const parsed = parseDeviceLine(line);
    if (!parsed.ok) failures.push(`device line rejected by the browser parser: "${line}" (${parsed.reason})`);
    if (line.startsWith('TEL ')) {
      lastTel = line;
      return;
    }
    const m = /session=([0-9a-f]{8})/.exec(line);
    if (line.startsWith('HELLO_OK') && m) session = m[1]!;
    queue.push(line);
  });
  let now = 0;
  for (const { no, text } of c.lines) {
    const [op, ...tok] = text.split(' ');
    const rest = text.slice(op!.length + 1);
    const fail = (msg: string) => failures.push(`line ${no}: ${msg}`);
    switch (op) {
      case 'BOOT':
        now = Number(tok[0]);
        core.begin(now, tok[1] as ResetReason, Number(tok[2]));
        break;
      case '@':
        now = Number(tok[0]);
        core.tick(now);
        break;
      case '~':
      case '~p': {
        const to = Number(tok[0]);
        const step = Number(tok[1]);
        let n = 1000;
        while (now + step <= to) {
          now += step;
          if (op === '~p') {
            core.onLine(`PING ${n++}`, now);
            if (queue.at(-1)?.startsWith('PONG')) queue.pop();
          }
          core.tick(now);
        }
        break;
      }
      case '>':
        core.onLine(rest.replace('$S', session), now);
        break;
      case '<': {
        const got = queue.shift();
        if (got === undefined) fail(`expected "${rest}" but no line was sent`);
        else if (!got.startsWith(rest)) fail(`expected prefix "${rest}", got "${got}"`);
        break;
      }
      case '<!':
        if (queue.length) fail(`unexpected line "${queue[0]}"`);
        break;
      case 'CLEAR':
        queue.length = 0;
        break;
      case 'D':
        core.setDistance(Number(tok[0]), tok[1] as CoreDistStatus, now);
        break;
      case '?': {
        const o = core.outputs;
        for (const kv of tok) {
          const [k, v] = kv.split('=');
          const actual = k === 'st' ? core.state : k === 'en' ? String(o.enabled ? 1 : 0) : k === 'l' ? String(o.left) : k === 'r' ? String(o.right) : '?';
          if (actual !== v) fail(`${k} expected ${v}, got ${actual}`);
        }
        break;
      }
      case 'T':
        for (const kv of tok) if (!lastTel.split(' ').includes(kv)) fail(`telemetry "${lastTel}" lacks ${kv}`);
        break;
      default:
        fail(`unknown instruction ${op}`);
    }
  }
  return failures;
}

describe('Protocol v1 conformance vectors (simulated device = firmware logic)', () => {
  const cases = loadCases();
  it('loads the shared vector file', () => {
    expect(cases.length).toBeGreaterThanOrEqual(18);
  });
  for (const c of cases) {
    it(c.name, () => {
      expect(run(c)).toEqual([]);
    });
  }
});
