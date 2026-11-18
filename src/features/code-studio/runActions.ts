import type { WorkspaceSvg } from 'blockly/core';
import { log } from '../../utils/logger';
import type { BlockIssue, GeneratedProgram } from './blockly/generator';
import { useCodeStudioStore } from './codeStudioStore';
import { editors } from './editorRegistry';
import { activeProgram, createProgram } from './programActions';
import { reportProgramIssues, runProgram } from './runtime/executionManager';

/**
 * Run the open program. Blockly programs are checked and turned into
 * JavaScript first; both kinds then take the same path:
 * sandbox → host bridge → Robot Control API → C2.
 */

/** Show block problems as warning bubbles on the blocks and select the first error. */
function markBlocks(workspace: WorkspaceSvg | null, issues: BlockIssue[]): void {
  if (!workspace) return;
  for (const block of workspace.getAllBlocks(false)) block.setWarningText(null);
  for (const issue of issues) {
    if (!issue.blockId) continue;
    const block = workspace.getBlockById(issue.blockId);
    block?.setWarningText(issue.message);
  }
  const first = issues.find((i) => i.severity === 'error' && i.blockId);
  if (first) workspace.getBlockById(first.blockId!)?.select();
}

/** Generate JavaScript for the open Blockly program (live workspace if shown). */
export async function generateActiveBlockly(): Promise<GeneratedProgram | null> {
  const program = activeProgram();
  if (!program || program.language !== 'blockly') return null;
  // Blockly is a separate lazy chunk: JavaScript-only users never download it.
  const { generateFromSource, generateFromWorkspace } = await import('./blockly/generator');
  const workspace = editors.blockly();
  if (workspace) return generateFromWorkspace(workspace);
  const source = useCodeStudioStore.getState().drafts[program.id] ?? program.source;
  return generateFromSource(source);
}

export async function runActiveProgram(): Promise<boolean> {
  const program = activeProgram();
  if (!program) return false;
  if (program.language === 'blockly') {
    const generated = (await generateActiveBlockly())!;
    markBlocks(editors.blockly(), generated.issues);
    if (!generated.ok) {
      reportProgramIssues(program.id, program.name, generated.issues, 'validation');
      return false;
    }
    for (const warning of generated.issues.filter((i) => i.severity === 'warning')) log.warning('code', warning.message);
    return runProgram({ programId: program.id, programName: program.name, language: 'blockly', code: generated.code, requirements: generated.requirements }).ok;
  }
  const source = useCodeStudioStore.getState().drafts[program.id] ?? program.source;
  return runProgram({ programId: program.id, programName: program.name, language: 'javascript', code: source }).ok;
}

/** Save the code generated from the open Blockly program as a new JavaScript program. The blocks are kept. */
export async function convertActiveToJavaScript(): Promise<boolean> {
  const program = activeProgram();
  const generated = await generateActiveBlockly();
  if (!program || !generated) return false;
  if (!generated.ok) {
    markBlocks(editors.blockly(), generated.issues);
    reportProgramIssues(program.id, program.name, generated.issues, 'validation');
    return false;
  }
  const created = createProgram('javascript', `${program.name} (JavaScript)`, generated.code);
  if (created) log.success('code', `Created the JavaScript program "${created.name}" from the blocks. The block program is unchanged.`);
  return Boolean(created);
}
