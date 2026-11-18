import { autocompletion, snippetCompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete';
import { indentWithTab } from '@codemirror/commands';
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, hoverTooltip, keymap, type DecorationSet } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import { API_REFERENCE, findApiEntry } from '../api/apiReference';
import { checkSyntax } from '../utils/programValidation';

/**
 * CodeMirror 6 setup for the JavaScript editor: syntax highlighting, line
 * numbers, indentation, find & replace (Ctrl+F / Ctrl+H via basicSetup),
 * history, bracket matching, robot API autocomplete with documentation,
 * syntax-error underlining and a runtime-error line marker.
 */

// ── Theme (AutoBotAI dark tokens) ──
const theme = EditorView.theme(
  {
    '&': { color: '#e2e8f0', backgroundColor: '#0d0f13', height: '100%', fontSize: '12.5px' },
    '.cm-content': { fontFamily: 'var(--font-mono)', caretColor: '#3b82f6', padding: '8px 0' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
    '.cm-gutters': { backgroundColor: '#111318', color: '#64748b', borderRight: '1px solid #252a33' },
    '.cm-activeLineGutter': { backgroundColor: '#191d24', color: '#94a3b8' },
    '.cm-activeLine': { backgroundColor: 'rgb(59 130 246 / 0.06)' },
    '&.cm-focused .cm-cursor': { borderLeftColor: '#3b82f6' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'rgb(59 130 246 / 0.3) !important' },
    '.cm-matchingBracket': { backgroundColor: 'rgb(59 130 246 / 0.25)', outline: 'none' },
    '.cm-tooltip': { backgroundColor: '#1e232b', border: '1px solid #303641', color: '#f1f5f9', borderRadius: '6px' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'rgb(59 130 246 / 0.25)', color: '#f1f5f9' },
    '.cm-completionInfo': { maxWidth: '320px', whiteSpace: 'normal', fontSize: '11.5px', lineHeight: '1.45' },
    '.cm-panels': { backgroundColor: '#191d24', color: '#f1f5f9', borderBottom: '1px solid #303641' },
    '.cm-panels input, .cm-panels button': { fontSize: '11.5px' },
    '.cm-textfield': { backgroundColor: '#111318', border: '1px solid #303641', color: '#f1f5f9', borderRadius: '4px' },
    '.cm-button': { backgroundImage: 'none', backgroundColor: '#252b35', border: '1px solid #303641', color: '#f1f5f9', borderRadius: '4px' },
    '.cm-searchMatch': { backgroundColor: 'rgb(245 158 11 / 0.25)' },
    '.cm-error-line': { backgroundColor: 'rgb(239 68 68 / 0.14)' },
    '.cm-foldPlaceholder': { backgroundColor: '#252b35', border: 'none', color: '#94a3b8' },
    '.cm-api-doc': { padding: '6px 8px', maxWidth: '340px', fontSize: '11.5px' },
    '.cm-api-doc code': { color: '#93c5fd', fontFamily: 'var(--font-mono)' },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: t.keyword, color: '#c084fc' },
  { tag: [t.controlKeyword, t.moduleKeyword], color: '#c084fc' },
  { tag: [t.string, t.special(t.string)], color: '#86efac' },
  { tag: [t.number, t.bool, t.null], color: '#fbbf24' },
  { tag: t.comment, color: '#64748b', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#60a5fa' },
  { tag: t.propertyName, color: '#93c5fd' },
  { tag: t.variableName, color: '#e2e8f0' },
  { tag: [t.operator, t.punctuation], color: '#94a3b8' },
  { tag: t.definition(t.variableName), color: '#f1f5f9' },
]);

// ── Robot API autocomplete ──
const apiCompletions: Completion[] = API_REFERENCE.map((entry) =>
  snippetCompletion(entry.snippet, {
    label: entry.name,
    detail: entry.signature.replace(/^[\w.]+?(?=\()/, ''),
    info: entry.description,
    type: 'function',
    boost: 10,
  }),
);
const globalsCompletions: Completion[] = [
  { label: 'robotControl', type: 'namespace', info: 'Drive the robot and move joints (validated by the C2 Command Bus).' },
  { label: 'robot', type: 'namespace', info: 'Read joints and wait for them.' },
  { label: 'RobotCommandError', type: 'class', info: 'Thrown when the robot refuses a command (for example a joint target outside its limits).' },
];

export function robotCompletions(context: CompletionContext) {
  const word = context.matchBefore(/[\w$.]+/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  return { from: word.from, options: [...apiCompletions, ...globalsCompletions], validFor: /^[\w$.]*$/ };
}

// ── Hover documentation for API calls ──
const apiHover = hoverTooltip((view, pos) => {
  const line = view.state.doc.lineAt(pos);
  const text = line.text;
  let start = pos - line.from;
  let end = start;
  while (start > 0 && /[\w$.]/.test(text[start - 1]!)) start -= 1;
  while (end < text.length && /[\w$]/.test(text[end]!)) end += 1;
  const word = text.slice(start, end);
  const entry = findApiEntry(word) ?? API_REFERENCE.find((e) => word.endsWith(e.name));
  if (!entry) return null;
  return {
    pos: line.from + start,
    end: line.from + end,
    above: true,
    create: () => {
      const dom = document.createElement('div');
      dom.className = 'cm-api-doc';
      const sig = document.createElement('code');
      sig.textContent = entry.signature;
      const desc = document.createElement('div');
      desc.textContent = entry.description;
      dom.append(sig, desc);
      return { dom };
    },
  };
});

// ── Syntax errors as you type (acorn; reads the code only) ──
const syntaxLinter = linter(
  (view): Diagnostic[] => {
    const code = view.state.doc.toString();
    const issue = checkSyntax(code)[0];
    if (!issue?.line) return [];
    const line = view.state.doc.line(Math.min(issue.line, view.state.doc.lines));
    const from = Math.min(line.from + (issue.column ?? 0), line.to);
    return [{ from, to: Math.max(from + 1, line.to), severity: 'error', message: issue.message }];
  },
  { delay: 400 },
);

// ── Runtime error line marker ──
export const setErrorLine = StateEffect.define<number | null>();
const errorLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setErrorLine)) continue;
      if (effect.value === null || effect.value < 1 || effect.value > tr.state.doc.lines) next = Decoration.none;
      else next = Decoration.set([Decoration.line({ class: 'cm-error-line' }).range(tr.state.doc.line(effect.value).from)]);
    }
    if (tr.docChanged) next = Decoration.none;
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export interface EditorOptions {
  doc: string;
  readOnly?: boolean;
  onChange?: (doc: string) => void;
  onSave?: () => void;
  onRun?: () => void;
}

export function createEditorState(options: EditorOptions): EditorState {
  const extensions: Extension[] = [
    basicSetup,
    javascript(),
    syntaxHighlighting(highlight),
    theme,
    errorLineField,
    EditorView.lineWrapping,
    keymap.of([
      indentWithTab,
      { key: 'Mod-s', preventDefault: true, run: () => (options.onSave?.(), true) },
      { key: 'Mod-Enter', preventDefault: true, run: () => (options.onRun?.(), true) },
    ]),
  ];
  if (options.readOnly) {
    extensions.push(EditorState.readOnly.of(true), EditorView.editable.of(false));
  } else {
    extensions.push(
      javascriptLanguage.data.of({ autocomplete: robotCompletions }),
      autocompletion({ activateOnTyping: true, icons: true }),
      apiHover,
      lintGutter(),
      syntaxLinter,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) options.onChange?.(update.state.doc.toString());
      }),
    );
  }
  return EditorState.create({ doc: options.doc, extensions });
}

export { EditorView };

/** Format with Prettier, loaded only when the user clicks Format. */
export async function formatCode(code: string): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  try {
    const [prettier, babel, estree] = await Promise.all([import('prettier/standalone'), import('prettier/plugins/babel'), import('prettier/plugins/estree')]);
    // Programs may use top-level await and return; wrap so the parser accepts them, then unwrap.
    const wrapped = `async function __program__() {\n${code}\n}\n`;
    const formatted = await prettier.format(wrapped, { parser: 'babel', plugins: [babel, estree], printWidth: 90, singleQuote: false });
    const body = formatted.replace(/^async function __program__\(\) \{\n/, '').replace(/\n?\}\n?$/, '');
    const lines = body.split('\n').map((line) => (line.startsWith('  ') ? line.slice(2) : line));
    return { ok: true, code: `${lines.join('\n').trim()}\n` };
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).split('\n')[0]!;
    return { ok: false, error: message };
  }
}
