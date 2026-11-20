/**
 * Minimal types for `node:fs`, used ONLY by the hardware tests to read the shared
 * protocol vector file (firmware/esp32-explorer-bot/test/vectors). The app never imports Node modules.
 */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
