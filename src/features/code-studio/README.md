# Code Studio (Phase 4 — active)

Program the open robot with **Blockly** or **JavaScript**. Both run through one path:

`program → sandbox worker (opaque-origin iframe) → HostBridge → robotControl (source "code") → C2 → movement engine`

Programs never touch stores, the movement engine, the DOM or the network.

- Architecture: `docs/architecture/CODE-STUDIO.md`
- Sandbox and message protocol: `docs/architecture/CODE-EXECUTION-SANDBOX.md`

Folders: `blockly/` (blocks, generator, toolbox), `editor/` (CodeMirror setup), `runtime/` (execution manager, bridge, protocol, limits), `sandbox/` (frame host, worker runtime), `storage/` (programs), `components/` (UI), `api/` (API reference), `utils/` (pre-run checks).
