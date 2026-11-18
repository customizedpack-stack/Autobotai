import type { WorkspaceSvg } from 'blockly/core';
import type { EditorView } from '@codemirror/view';

/**
 * The editors currently on screen (type-only imports: this module loads no
 * editor code). Run reads the live Blockly workspace; errors mark the live
 * code editor.
 */
let blockly: WorkspaceSvg | null = null;
let code: EditorView | null = null;

export const editors = {
  setBlockly: (workspace: WorkspaceSvg | null) => {
    blockly = workspace;
  },
  blockly: () => blockly,
  setCode: (view: EditorView | null) => {
    code = view;
  },
  code: () => code,
};
