# C3 — Code Studio (pointer)

The full Code Studio architecture is in **`CODE-STUDIO.md`**, and the sandbox is in **`CODE-EXECUTION-SANDBOX.md`**.

The Phase 4 and Phase 5 briefs refer to Code Studio as "C3". In the master build plan, the connector code **C3 is reserved for the Sensor Stream** (Phase 6). Code Studio is a module, not a connector: all of its robot traffic travels over **C2**, the Command Bus. This file exists so that both names lead to the same documentation. No second copy is kept, so the two cannot drift apart.

| Brief term | Where it lives |
| --- | --- |
| C3 Code Studio | `src/features/code-studio/` — see `CODE-STUDIO.md` |
| Code execution sandbox | `src/features/code-studio/sandbox/` and `runtime/` — see `CODE-EXECUTION-SANDBOX.md` |
| Program commands | C2 Command Bus (source `code`) — see `C2-COMMAND-BUS.md` |
