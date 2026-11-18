import type { WorkspaceSvg } from 'blockly/core';
import { useRobotStateStore } from '../../stores/robotStateStore';
import { useSceneStore } from '../../stores/sceneStore';
import { log } from '../../utils/logger';
import { onSessionEnd } from '../controls/controlSession';
import type { BlockIssue, GeneratedProgram } from './blockly/generator';
import { useCodeStudioStore } from './codeStudioStore';
import { editors } from './editorRegistry';
import { activeProgram, createProgram } from './programActions';
import { reportProgramIssues, runProgram } from './runtime/executionManager';
import { useProgramStore } from './storage/programStore';
import type { RobotProgram } from './storage/programTypes';

/**
 * Run the open program. Blockly programs are checked and turned into
 * JavaScript first; both kinds then take the same path:
 * sandbox → host bridge → Robot Control API → C2.
 *
 * Blockly lives in a lazy chunk, so generation starts with an `await`. Anything
 * may change during that await (another program, another project, leaving Code
 * Studio, deleting the program). The context is therefore captured BEFORE the
 * await and verified AFTER it; generation itself is synchronous and runs only
 * once the context is confirmed, so stale code is never generated or run.
 */

type GeneratorModule = typeof import('./blockly/generator');

let loadGenerator: () => Promise<GeneratorModule> = () => import('./blockly/generator');

/** Tests only: control when the lazy Blockly chunk "arrives". Pass null to restore the real loader. */
export function setGeneratorLoaderForTests(loader: (() => Promise<GeneratorModule>) | null): void {
  loadGenerator = loader ?? (() => import('./blockly/generator'));
}

/** Goes up whenever the live robot session ends (leaving Code Studio, closing the project). */
let sessionEpoch = 0;
onSessionEnd(() => {
  sessionEpoch += 1;
});

interface ActionContext {
  projectId: string;
  programId: string;
  epoch: number;
  /** The Blockly workspace on screen when the action started (null when blocks are not shown). */
  workspace: WorkspaceSvg | null;
}

function captureContext(program: RobotProgram): ActionContext | null {
  const projectId = useSceneStore.getState().projectId;
  if (!projectId || program.projectId !== projectId) return null;
  return { projectId, programId: program.id, epoch: sessionEpoch, workspace: editors.blockly() };
}

/** The same project, the same Blockly program (not deleted), still in Code Studio, and no session change since the capture. */
function currentProgramFor(ctx: ActionContext): RobotProgram | null {
  if (sessionEpoch !== ctx.epoch) return null;
  if (useSceneStore.getState().projectId !== ctx.projectId) return null;
  if (useCodeStudioStore.getState().activeProgramId !== ctx.programId) return null;
  if (useRobotStateStore.getState().mode !== 'code') return null;
  const program = useProgramStore.getState().programs[ctx.programId];
  if (!program || program.projectId !== ctx.projectId || program.language !== 'blockly') return null;
  return program;
}

function cancelled(action: string): false {
  log.info('code', `${action} was cancelled because the open program changed while the blocks were loading. Try again.`);
  return false;
}

/** Show block problems as warning bubbles on the blocks and select the first error. */
function markBlocks(workspace: WorkspaceSvg | null, issues: BlockIssue[]): void {
  if (!workspace) return;
  for (const block of workspace.getAllBlocks(false)) block.setWarningText(null);
  for (const issue of issues) {
    if (!issue.blockId) continue;
    workspace.getBlockById(issue.blockId)?.setWarningText(issue.message);
  }
  const first = issues.find((i) => i.severity === 'error' && i.blockId);
  if (first?.blockId) workspace.getBlockById(first.blockId)?.select();
}

interface Generated {
  generated: GeneratedProgram;
  workspace: WorkspaceSvg | null;
  program: RobotProgram;
}

/** Load Blockly, confirm the context, then generate synchronously. Null when the context changed. */
async function generateForContext(ctx: ActionContext): Promise<Generated | null> {
  const generator = await loadGenerator();
  const program = currentProgramFor(ctx);
  if (!program) return null;
  // Use the live workspace only if it is still the one the action started with.
  const workspace = ctx.workspace && editors.blockly() === ctx.workspace ? ctx.workspace : null;
  if (workspace) return { generated: generator.generateFromWorkspace(workspace), workspace, program };
  const source = useCodeStudioStore.getState().drafts[program.id] ?? program.source;
  return { generated: generator.generateFromSource(source), workspace: null, program };
}

/** Generate JavaScript for the open Blockly program (read-only code view). Null if it is not a block program or changed meanwhile. */
export async function generateActiveBlockly(): Promise<GeneratedProgram | null> {
  const program = activeProgram();
  if (!program || program.language !== 'blockly') return null;
  const ctx = captureContext(program);
  if (!ctx) return null;
  const result = await generateForContext(ctx);
  return result?.generated ?? null;
}

export async function runActiveProgram(): Promise<boolean> {
  const program = activeProgram();
  if (!program) return false;
  if (program.language === 'javascript') {
    const source = useCodeStudioStore.getState().drafts[program.id] ?? program.source;
    return runProgram({ programId: program.id, programName: program.name, language: 'javascript', code: source }).ok;
  }
  const ctx = captureContext(program);
  if (!ctx) return false;
  const result = await generateForContext(ctx);
  if (!result) return cancelled('Run');
  const { generated, workspace, program: current } = result;
  markBlocks(workspace, generated.issues);
  if (!generated.ok) {
    reportProgramIssues(current.id, current.name, generated.issues, 'validation');
    return false;
  }
  for (const warning of generated.issues.filter((i) => i.severity === 'warning')) log.warning('code', warning.message);
  return runProgram({ programId: current.id, programName: current.name, language: 'blockly', code: generated.code, requirements: generated.requirements }).ok;
}

/** Save the code generated from the open Blockly program as a new JavaScript program. The blocks are kept. */
export async function convertActiveToJavaScript(): Promise<boolean> {
  const program = activeProgram();
  if (!program || program.language !== 'blockly') return false;
  const ctx = captureContext(program);
  if (!ctx) return false;
  const result = await generateForContext(ctx);
  if (!result) return cancelled('Convert to JavaScript');
  const { generated, workspace, program: current } = result;
  if (!generated.ok) {
    markBlocks(workspace, generated.issues);
    reportProgramIssues(current.id, current.name, generated.issues, 'validation');
    return false;
  }
  const created = createProgram('javascript', `${current.name} (JavaScript)`, generated.code);
  if (created) log.success('code', `Created the JavaScript program "${created.name}" from the blocks. The block program is unchanged.`);
  return Boolean(created);
}
