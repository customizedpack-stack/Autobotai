/**
 * Minimal types for `node:vm`, used ONLY by the Code Studio test helper
 * (testUtils.ts) to run the sandbox runtime in an isolated context under
 * Vitest. The app itself never imports Node modules, so the full Node type
 * definitions stay out of the app's TypeScript configuration.
 */
declare module 'node:vm' {
  type Context = Record<string, unknown>;
  function createContext(sandbox: Context): Context;
  function runInContext(code: string, context: Context): unknown;
  const vm: { createContext: typeof createContext; runInContext: typeof runInContext };
  export default vm;
}
