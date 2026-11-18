import { useEffect, useRef } from 'react';
import { createEditorState, EditorView, setErrorLine } from '../editor/codeEditorSetup';
import { editors } from '../editorRegistry';

interface JavaScriptEditorProps {
  /** Initial text. Remount (key) to load another program. */
  initialDoc: string;
  readOnly?: boolean;
  onChange?: (doc: string) => void;
  onRun?: () => void;
  /** Line to mark as the place of a runtime error (1-based). */
  errorLine?: number | null;
  testId?: string;
}

/** CodeMirror 6 editor. Created once per mount; React never re-renders its content. */
export function JavaScriptEditor({ initialDoc, readOnly = false, onChange, onRun, errorLine, testId = 'js-editor' }: JavaScriptEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onRun });
  callbacks.current = { onChange, onRun };

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: createEditorState({
        doc: initialDoc,
        readOnly,
        onChange: (doc) => callbacks.current.onChange?.(doc),
        onRun: () => callbacks.current.onRun?.(),
      }),
    });
    view.current = editor;
    if (!readOnly) editors.setCode(editor);
    return () => {
      if (!readOnly && editors.code() === editor) editors.setCode(null);
      editor.destroy();
      view.current = null;
    };
    // The document is owned by CodeMirror after mount; a new program remounts the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Read-only views (generated code) follow their input.
  useEffect(() => {
    const editor = view.current;
    if (!editor || !readOnly) return;
    if (editor.state.doc.toString() !== initialDoc) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: initialDoc } });
  }, [initialDoc, readOnly]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const line = errorLine ?? null;
    editor.dispatch({ effects: setErrorLine.of(line) });
    if (line && line <= editor.state.doc.lines) {
      editor.dispatch({ effects: EditorView.scrollIntoView(editor.state.doc.line(line).from, { y: 'center' }) });
    }
  }, [errorLine]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" data-testid={testId} data-code-editor="javascript" />;
}
